#!/usr/bin/env python3
"""Convert a single-game score sheet in the team's ORIGINAL format
(當日比賽統計 / 打　擊 / 投球守備) into the platform's game JSON.

Usage:
  python3 tools/convert_single_game.py <old_game.xlsx> [--id G20251222-01] [--tournament 友誼賽]
                                       [--opponent 工海物治] [--out data/games/xxx.json]

What it does
  * reads the header block (date, venue, weather, recorder, teams, line score)
  * reads the lineup (棒次 / 守位 / 球員) and the pitchers block (任務 / 球員)
  * reads every plate appearance from 打　擊 (ours) and 投球守備 (opponent vs our pitchers),
    resolving names that are formulas pointing at the lineup
  * reconstructs the inning of every PA from the I/II/III outcome codes
  * cross-checks runs per inning against the line score and reports differences
Row 2 of the PA sheets is the sheet's own example row (范立) and is skipped.
"""
import argparse, json, os, re, sys, datetime as dt
from openpyxl import load_workbook

POSN = {1: "P", 2: "C", 3: "1B", 4: "2B", 5: "3B", 6: "SS", 7: "LF", 8: "CF", 9: "RF"}


def cell(ws, ref):
    v = ws[ref].value
    return v


def parse_pos(raw):
    """'CF(P)' -> ('CF', True); '(PR)' -> ('PR', False); '(PH)DH(CF)(LF)' -> ('DH', False)."""
    raw = (raw or "").strip()
    if not raw:
        return "", True
    starter = not raw.startswith("(")
    m = re.search(r"(?<!\()\b([A-Z0-9]{1,2}B?|SS|LF|CF|RF|DH|PH|PR|C|P)\b(?![^(]*\))", raw)
    primary = m.group(1) if m else re.sub(r"[()]", "", raw).split("(")[0]
    # fall back: first token outside parentheses, else first token inside
    outside = re.sub(r"\([^)]*\)", " ", raw).split()
    inside = re.findall(r"\(([^)]*)\)", raw)
    primary = outside[0] if outside else (inside[0] if inside else raw)
    return primary, starter


def num(v):
    if v in (None, ""):
        return 0
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def parse_loc(v):
    if v is None:
        return None
    m = re.match(r"\s*(\d)", str(v))
    return int(m.group(1)) if m else None


def parse_time(v):
    if isinstance(v, dt.time):
        return v.strftime("%H:%M")
    if isinstance(v, dt.datetime):
        return v.strftime("%H:%M")
    s = str(v or "").replace("：", ":").strip()
    m = re.match(r"(\d{1,2}):(\d{2})", s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else (s or None)


def read_summary(wb):
    s = wb["當日比賽統計"]
    date = cell(s, "S2")
    date = date.strftime("%Y-%m-%d") if isinstance(date, (dt.datetime, dt.date)) else str(date)
    rows = {}
    for r in (3, 4):
        name = cell(s, f"D{r}")
        if not name:
            continue
        rows[r] = {"name": str(name).strip(), "wl": cell(s, f"B{r}"), "ha": cell(s, f"C{r}"),
                   "line": [cell(s, f"{c}{r}") for c in "EFGHIJKL"]}
    lineup = []
    for r in range(8, 30):
        name = cell(s, f"D{r}")
        if not name or str(name).strip() in ("總和",):
            if name and str(name).strip() == "總和":
                break
            continue
        order = cell(s, f"B{r}")
        pos, starter = parse_pos(str(cell(s, f"C{r}") or ""))
        lineup.append({"row": r, "order": int(order) if isinstance(order, (int, float)) else None, "pos_raw": cell(s, f"C{r}"), "pos": pos, "name": str(name).strip(), "starter": starter})
    pitchers = []
    for r in range(20, 45):
        if cell(s, f"B{r}") == "勝敗" and cell(s, f"C{r}") == "任務":
            for rr in range(r + 1, r + 12):
                nm = cell(s, f"D{rr}")
                if not nm or str(nm).strip() == "總和":
                    break
                pitchers.append({"name": str(nm).strip(), "role": cell(s, f"C{rr}") or "", "decision": cell(s, f"B{rr}") or ""})
            break
    return {"date": date, "time": parse_time(cell(s, "S3")), "venue": cell(s, "V2"), "weather": cell(s, "V3"), "recorder": cell(s, "V4"),
            "attendance": num(cell(s, "S4")), "teams": rows, "lineup": lineup, "pitchers": pitchers}


def read_pa(ws, lineup_by_row):
    rows = []
    for r in range(3, ws.max_row + 1):
        name = ws.cell(r, 3).value
        if name is None or str(name).strip() == "":
            continue
        if isinstance(name, str) and name.startswith("="):
            m = re.search(r"!\$?D\$?(\d+)", name)
            name = lineup_by_row.get(int(m.group(1)), name) if m else name
        seq = [ws.cell(r, k).value for k in range(4, 13)]
        seq = [str(x).strip().upper() for x in seq if x not in (None, "")]
        v = {k: ws.cell(r, k).value for k in range(16, 26)}
        rows.append({"row": r, "code": (str(ws.cell(r, 1).value).strip().upper() if ws.cell(r, 1).value else None), "order": num(ws.cell(r, 2).value),
                     "name": str(name).strip(), "pitches": seq, "result": (str(v[16]).strip() if v[16] else ""), "loc": parse_loc(v[17]), "traj": v[18], "quality": v[19],
                     "sb": num(v[20]), "adv_err": num(v[21]), "out_on_base": num(v[22]), "run": num(v[23]), "rbi": num(v[24]), "note": v[25]})
    return rows


def assign_innings(rows):
    """Inning boundaries: the inning ends after the row that produces the 3rd out (code III), or after a
    row carrying a double play as the 2nd+3rd out. A trailing row marked L right after III (runner out
    during that PA) is kept in the same inning."""
    inning, outs = 1, 0
    for i, r in enumerate(rows):
        if r.pop("_handled", False):
            continue
        r["inning"], r["outs_before"] = inning, outs
        c = r["code"]
        if c in ("I", "II", "III"):
            outs = {"I": 1, "II": 2, "III": 3}[c]
        if outs >= 3:
            nxt = rows[i + 1] if i + 1 < len(rows) else None
            # The 3rd out was a runner (this row's batter reached base; 壘死 marks a runner out). Scorers put
            # that out on the runner's row even though it happened during the next batter's PA, so a following
            # non-out row still belongs to this inning.
            runner_out = r["out_on_base"] > 0 and r["result"] in ("一安", "二安", "三安", "保送", "故四", "觸身", "失誤", "野選", "妨礙")
            if runner_out and nxt and nxt["code"] not in ("I", "II", "III"):
                nxt["inning"], nxt["outs_before"] = inning, 2
                rows[i + 1] = nxt
                inning, outs = inning + 1, 0
                # skip the straggler in the loop by marking it handled
                nxt["_handled"] = True
                continue
            inning, outs = inning + 1, 0
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--id")
    ap.add_argument("--tournament", default="友誼賽")
    ap.add_argument("--opponent")
    ap.add_argument("--team", default="喝FIN就好BA")
    ap.add_argument("--out")
    a = ap.parse_args()

    wb = load_workbook(a.xlsx)
    summ = read_summary(wb)
    teams = summ["teams"]
    us = next((t for t in teams.values() if t["name"] == a.team), None)
    opp = next((t for t in teams.values() if t["name"] != a.team), None)
    if us is None:  # team name not found: assume the row with a lineup is ours (row 4 in the original file)
        us = teams.get(4) or list(teams.values())[-1]
        opp = teams.get(3) or list(teams.values())[0]
    home_away = "主" if (us.get("ha") == "主" or (us.get("ha") is None and list(teams.keys())[-1] == 4)) else "客"
    opponent = a.opponent or opp["name"]
    game_id = a.id or f"G{summ['date'].replace('-', '')}-01"

    lineup_by_row = {l["row"]: l["name"] for l in summ["lineup"]}
    bat = assign_innings(read_pa(wb["打　擊"], lineup_by_row))
    pit = assign_innings(read_pa(wb["投球守備"], lineup_by_row))
    pos_of = {l["name"]: l["pos"] for l in summ["lineup"]}
    for r in bat:
        r["pos"] = pos_of.get(r["name"], "")

    # cross-check with the line score
    def runs_by_inning(rows, key):
        out = {}
        for r in rows:
            out[r["inning"]] = out.get(r["inning"], 0) + (r["run"] if key == "bat" else (1 if r["code"] in ("R", "ER") else 0))
        return out
    rb, rp = runs_by_inning(bat, "bat"), runs_by_inning(pit, "pit")
    warnings = []
    for label, sheet_line, derived in (("我隊", us["line"], rb), ("對手", opp["line"], rp)):
        for i, v in enumerate(sheet_line, start=1):
            if v in (None, "", "X", "x"):
                continue
            if num(v) != derived.get(i, 0):
                warnings.append(f"{label}第 {i} 局：紀錄表 {num(v)} 分，逐打席推算 {derived.get(i, 0)} 分")
    innings_played = max([r["inning"] for r in bat + pit] + [1])

    game = {
        "game_id": game_id, "date": summ["date"], "time": summ["time"], "tournament": a.tournament, "season": summ["date"][:4],
        "opponent": opponent, "home_away": home_away, "venue": summ["venue"], "weather": summ["weather"], "recorder": summ["recorder"],
        "attendance_players": summ["attendance"], "result": "W" if sum(rb.values()) > sum(rp.values()) else "L" if sum(rb.values()) < sum(rp.values()) else "T",
        "innings_played": innings_played,
        "line_score": {"us": [num(v) if v not in (None, "", "X", "x") else None for v in us["line"]], "opp": [num(v) if v not in (None, "", "X", "x") else None for v in opp["line"]]},
        "runs_us": sum(rb.values()), "runs_opp": sum(rp.values()),
        "lineup": [{k: v for k, v in l.items() if k != "row"} for l in summ["lineup"]],
        "pitchers": summ["pitchers"], "batting": bat, "pitching": pit, "warnings": warnings, "source_file": os.path.basename(a.xlsx),
    }
    out = a.out or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "games", f"{game_id}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(game, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{game_id}: {game['date']} vs {opponent} ({home_away}) {game['runs_us']}-{game['runs_opp']} {game['result']} | {len(bat)} PA, {len(pit)} opp PA, {innings_played} innings -> {out}")
    for w in warnings:
        print("  ⚠", w)


if __name__ == "__main__":
    main()
