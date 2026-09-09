#!/usr/bin/env python3
"""Build the BAFIN master baseball workbook.

Usage:  python3 tools/build_workbook.py [output.xlsx]

Sheets
  說明          how to use, legend
  設定          parameters (innings per game, FIP constant, wOBA weights) + dropdown lists
  球員名單      roster
  比賽清單      one row per game (inputs + computed R/H/E/LOB/line score)
  打席紀錄      long-format log: one row per plate appearance of OUR batters
  投球紀錄      long-format log: one row per opponent PA against OUR pitchers
  守備紀錄      per game per player fielding line
  總表          all-time stats with filters (杯賽 / 日期 / 守位 / 對手 / 主客 / 勝敗)
  單場-摘要 / 單場-打擊 / 單場-投球   template for recording a new game
  數據字典      every stat, its formula and status
All stats are live formulas over the logs; nothing is hard-coded.
"""
import json, os, sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.comments import Comment

sys.path.insert(0, os.path.dirname(__file__))
from stat_dictionary import STAT_DICTIONARY

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "BAFIN_棒球數據總表.xlsx")
import glob as _glob
GAMES = [json.load(open(f, encoding="utf-8")) for f in sorted(_glob.glob(os.path.join(ROOT, "data", "games", "*.json")))]
GAME = GAMES[0]   # first game also seeds the 單場 template as a worked example
def roster_from_games():
    seen, out = set(), []
    for g in GAMES:
        for l in g["lineup"] + [{"name": p["name"], "pos": "P"} for p in g["pitchers"]]:
            if l["name"] not in seen:
                seen.add(l["name"]); out.append({"name": l["name"], "pos": l.get("pos", "")})
    return out
ROSTER = roster_from_games()

LOG_ROWS = int(os.environ.get("LOG_ROWS", "3000"))           # pre-formatted rows in each log
ROSTER_ROWS = 30          # players supported in 總表
TEMPLATE_PA_ROWS = 60

# ----------------------------------------------------------------------------- styles
FONT = "Arial"
f_base = Font(name=FONT, size=10)
f_bold = Font(name=FONT, size=10, bold=True)
f_title = Font(name=FONT, size=16, bold=True, color="FFFFFF")
f_h = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_input = Font(name=FONT, size=10, color="0000FF")
f_link = Font(name=FONT, size=10, color="008000")
f_note = Font(name=FONT, size=9, italic=True, color="666666")
fill_title = PatternFill("solid", fgColor="1F3A2E")     # deep field green
fill_h = PatternFill("solid", fgColor="2E5E4E")         # header green
fill_h_auto = PatternFill("solid", fgColor="6B7B75")    # gray header = formula column
fill_input = PatternFill("solid", fgColor="FFF6CC")     # pale yellow = user input
fill_filter = PatternFill("solid", fgColor="FFFF00")
fill_band = PatternFill("solid", fgColor="F3F6F4")
fill_total = PatternFill("solid", fgColor="E3EBE6")
thin = Side(style="thin", color="C9D3CD")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left = Alignment(horizontal="left", vertical="center", wrap_text=True)

def hdr(ws, row, col, text, auto=False, width=None):
    c = ws.cell(row=row, column=col, value=text)
    c.font = f_h; c.fill = fill_h_auto if auto else fill_h; c.alignment = center; c.border = border
    if width: ws.column_dimensions[L(col)].width = width
    return c

def put(ws, row, col, value, font=f_base, fill=None, fmt=None, align=None, b=True):
    c = ws.cell(row=row, column=col, value=value)
    c.font = font
    if fill: c.fill = fill
    if fmt: c.number_format = fmt
    if align: c.alignment = align
    if b: c.border = border
    return c

def title(ws, text, span=8, sub=None):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    c = ws.cell(row=1, column=1, value=text); c.font = f_title; c.fill = fill_title
    c.alignment = Alignment(vertical="center"); ws.row_dimensions[1].height = 28
    if sub:
        s = ws.cell(row=2, column=1, value=sub); s.font = f_note

# ----------------------------------------------------------------------------- column specs
PITCH_N = 12
BAT_INPUT = ["比賽ID", "局", "出局(前)", "壘上(前)", "棒次", "守位", "打者"] + [f"球{i}" for i in range(1, PITCH_N + 1)] + \
            ["好球", "界外", "壞球", "用球數", "打擊結果", "落點", "軌跡", "強度", "盜壘", "盜壘失敗", "失誤進壘", "壘死", "得分", "打點", "結果代碼", "備註"]
BAT_AUTO = ["日期", "杯賽", "對手", "主客", "勝敗", "打席", "打數", "安打", "一安", "二安", "三安", "全壘打", "壘打數", "保送", "故四", "觸身", "三振",
            "犧觸", "犧飛", "雙殺", "失誤上壘", "得點圈打數", "得點圈安打", "場內球", "滾地", "飛球", "平飛", "強擊", "揮空", "揮棒", "看好球",
            "首球揮棒", "優質打席", "慣用手", "拉打", "中間", "反方向", "首打席", "上壘"]
PIT_INPUT = ["比賽ID", "局", "出局(前)", "壘上(前)", "對方棒次", "投手", "對方打者"] + [f"球{i}" for i in range(1, PITCH_N + 1)] + \
            ["好球", "界外", "壞球", "用球數", "打擊結果", "落點", "軌跡", "強度", "被盜壘", "阻殺", "暴投", "捕逸", "牽制出局", "結果代碼", "備註"]
PIT_AUTO = ["日期", "杯賽", "對手", "主客", "勝敗", "打席", "打數", "安打", "二安", "三安", "全壘打", "保送", "故四", "觸身", "三振", "犧飛",
            "出局數", "失分", "自責", "場內球", "滾地", "飛球", "平飛", "強擊", "揮空", "揮棒", "看好球", "首球好球", "首人次", "先發"]
FLD_INPUT = ["比賽ID", "球員", "守位", "局數", "刺殺PO", "助殺A", "失誤E", "雙殺DP", "捕逸PB", "被盜壘SB", "阻殺CS", "備註"]
FLD_AUTO = ["日期", "杯賽", "對手", "主客", "勝敗"]
GAME_COLS = ["比賽ID", "日期", "時間", "年度", "杯賽", "對手", "主客", "場地", "天氣", "紀錄者", "局數", "勝敗", "我隊得分", "對手得分", "我隊安打", "對手安打",
             "我隊失誤", "對手失誤", "我隊殘壘", "勝投", "敗投", "救援", "中繼", "備註"] + [f"我{i}" for i in range(1, 10)] + [f"對{i}" for i in range(1, 10)]
GAME_INPUT = {"比賽ID", "日期", "時間", "杯賽", "對手", "主客", "場地", "天氣", "紀錄者", "局數", "勝投", "敗投", "救援", "中繼", "備註"}

def colmap(names):
    return {n: i + 1 for i, n in enumerate(names)}

BAT = colmap(BAT_INPUT + BAT_AUTO)
PIT = colmap(PIT_INPUT + PIT_AUTO)
FLD = colmap(FLD_INPUT + FLD_AUTO)
GM = colmap(GAME_COLS)
BL = {k: L(v) for k, v in BAT.items()}
PL = {k: L(v) for k, v in PIT.items()}
FL = {k: L(v) for k, v in FLD.items()}
GL = {k: L(v) for k, v in GM.items()}
P1, P12 = BL["球1"], BL[f"球{PITCH_N}"]          # same letters for pitching log (identical prefix)
LAST = LOG_ROWS + 1

# ----------------------------------------------------------------------------- lists (設定)
LISTS = {
    "杯賽清單": ["友誼賽", "校際盃", "系際盃", "社會組聯賽", "秋季聯賽", "春季聯賽", "練習賽"],
    "守位清單": ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "PH", "PR"],
    "名單守位": ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "IF", "OF", "UT"],
    "打擊結果": ["一安", "二安", "三安", "全壘打", "保送", "故四", "觸身", "三振", "內滾", "內飛", "外飛", "界外飛", "野選", "失誤", "犧觸", "犧飛", "雙殺", "妨礙"],
    "落點": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "56", "46", "34", "78", "89"],
    "逐球代碼": ["S", "SS", "CS", "F", "IP", "B"],
    "結果代碼": ["I", "II", "III", "L", "R", "ER"],
    "壘上代碼": ["無", "1", "2", "3", "12", "13", "23", "123"],
    "對手清單": sorted({g["opponent"] for g in GAMES}),
    "主客": ["主", "客"],
    "軌跡": ["G", "F", "L"],
    "強度": ["強", "中", "弱"],
    "任務": ["SP", "RP", "CL"],
}
LIST_COL = {name: 5 + i for i, name in enumerate(list(LISTS.keys()))}   # lists start at column E

def list_ref(name, with_all=False, rows=40):
    col = L(LIST_COL[name])
    top = 2 if with_all else 3
    return f"設定!${col}${top}:${col}${rows}"

# ----------------------------------------------------------------------------- workbook
wb = Workbook()

# ============================================================================ 說明
ws = wb.active; ws.title = "說明"
title(ws, "喝FIN就好BA｜棒球數據總平台 使用說明", 6)
ws.column_dimensions["A"].width = 4; ws.column_dimensions["B"].width = 110
lines = [
    ("工作表結構", True),
    ("設定：每場局數、FIP 常數、wOBA 權重與所有下拉選單清單（杯賽、守位、打擊結果…）。新增杯賽或對手請先在這裡加入。", False),
    ("球員名單：球員基本資料。總表的球員列由此帶出，最多 30 人；打擊慣用手用來計算拉打／反方向。", False),
    ("比賽清單：每場比賽一列。黃色欄位手動輸入（比賽ID、日期、杯賽、對手、主客…），灰色欄位自動由紀錄算出（得分、安打、失誤、殘壘、逐局得分）。", False),
    ("打席紀錄／投球紀錄／守備紀錄：全時期資料庫。每個打席一列，所有統計都由這三張表即時計算。灰色標題欄為公式，請勿覆蓋。", False),
    ("總表：全時期統計。上方黃色篩選格可選杯賽、日期區間、守位、對手、主客、勝敗，下方球隊／打擊／投球／守備四張表同步更新。", False),
    ("單場-摘要／單場-打擊／單場-投球：新比賽的紀錄模板，版面沿用原本的單場紀錄表，並自動算出當場攻守成績。", False),
    ("數據字典：每一項數據的中英文名稱、公式、來源（現有／新增）與優先度。", False),
    ("", False),
    ("紀錄一場新比賽（三步驟）", True),
    ("1. 在『比賽清單』新增一列，填入比賽ID（格式 G+日期+場次，例如 G20251010-01）、日期、杯賽、對手、主客等。", False),
    ("2. 複製三張『單場-』模板（右鍵工作表 → 移動或複製 → 建立副本），在『單場-摘要』C2 填入同一個比賽ID，照原本習慣逐球紀錄；賽後在同一區塊填勝投／敗投／救援。", False),
    ("3. 比賽結束後，把『單場-打擊』有資料的列（A 欄到『備註』欄）複製，到『打席紀錄』最後一列下方以『貼上值』貼上；『單場-投球』貼到『投球紀錄』；『單場-摘要』的守備區塊貼到『守備紀錄』。總表即自動更新。", False),
    ("   也可以把整個檔案上傳到網站版儀表板（資料匯入頁），網站會自動讀取這三張紀錄表。", False),
    ("", False),
    ("逐球代碼", True),
    ("S 好球(未指定)　SS 揮棒落空　CS 未揮棒好球　F 界外　IP 擊球進場(In Play)　B 壞球", False),
    ("打擊結果", True),
    ("一安 二安 三安 全壘打 保送 故四(故意四壞) 觸身 三振(含不死三振) 內滾 內飛 外飛 界外飛(界外接殺) 野選 失誤(失誤上壘) 犧觸 犧飛 雙殺 妨礙(捕手妨礙)", False),
    ("結果代碼（沿用原表）", True),
    ("I／II／III 該打席造成第 1／2／3 個出局；L 殘壘；R 得分（投球紀錄中 R = 非自責分、ER = 自責分）。", False),
    ("新增欄位（讓進階數據可以計算）", True),
    ("出局(前)：打席開始時的出局數 0/1/2。　壘上(前)：打席開始時壘上跑者，無／1／2／3／12／13／23／123 → 用來算得點圈打擊率。", False),
    ("落點：出局填處理球的守備員 1–9（1 投 2 捕 3 一壘 4 二壘 5 三壘 6 游擊 7 左 8 中 9 右）；沒人碰到的穿越安打填縫隙代碼 56 三游／46 二游／34 一二／78 左中／89 右中。軌跡 G 滾地／F 飛球／L 平飛。強度 強／中／弱 → 近似 Statcast 的 Hard-Hit%。", False),
    ("盜壘失敗、暴投、捕逸、牽制出局、阻殺、刺殺、助殺：CPBL 官方紀錄項目，舊表缺少。", False),
    ("", False),
    ("顏色說明", True),
    ("黃底 = 手動輸入格　　灰色標題 = 自動公式欄　　藍字 = 可調整參數　　綠字 = 連結其他工作表", False),
    ("本檔內含 2025-10-10 vs 群風 一場實際比賽資料（由原單場紀錄表轉入），杯賽名稱『友誼賽』為假設值，請自行修正。", False),
]
r = 3
for text, bold in lines:
    c = ws.cell(row=r, column=2, value=text); c.font = f_bold if bold else f_base; c.alignment = left
    if bold: c.fill = fill_band
    r += 1

# ============================================================================ 設定
ws = wb.create_sheet("設定")
title(ws, "設定：參數與清單", 14, "藍字為可調整參數；清單第 2 列固定為「全部」供總表篩選使用，第 3 列起可自行增加。")
ws.column_dimensions["A"].width = 22; ws.column_dimensions["B"].width = 12; ws.column_dimensions["C"].width = 40
params = [
    ("球隊名稱", "喝FIN就好BA", "", None),
    ("每場局數", 7, "ERA 換算基準。社會組／校際多為 7 局；MLB、CPBL 為 9。", "0"),
    ("FIP常數", 3.135, "FIP = (13HR+3(BB+HBP)−2K)/IP + 常數。FanGraphs 2025 cFIP = 3.135；業餘可自行校正。", "0.000"),
    ("wBB", 0.691, "wOBA 線性權重（FanGraphs Guts! 2025 年值，可依年度更新）", "0.000"),
    ("wHBP", 0.722, "", "0.000"),
    ("w1B", 0.882, "", "0.000"),
    ("w2B", 1.252, "", "0.000"),
    ("w3B", 1.584, "", "0.000"),
    ("wHR", 2.037, "", "0.000"),
    ("畢氏指數", 1.83, "畢氏期望勝率指數", "0.00"),
]
hdr(ws, 3, 1, "參數"); hdr(ws, 3, 2, "值"); hdr(ws, 3, 3, "說明")
PARAM = {}
for i, (k, v, note, fmt) in enumerate(params):
    rr = 4 + i
    put(ws, rr, 1, k, f_bold); put(ws, rr, 2, v, f_input, fill_input, fmt); put(ws, rr, 3, note, f_note, align=left)
    PARAM[k] = f"設定!$B${rr}"
for name, items in LISTS.items():
    col = LIST_COL[name]
    hdr(ws, 3, col, name, width=12)
    put(ws, 2, col, "全部", f_bold, fill_band)
    for j, it in enumerate(items):
        put(ws, 4 + j, col, it, f_input, fill_input)
    for j in range(4 + len(items), 41):
        put(ws, j, col, None, f_input, fill_input)
    # row 3 header, row 2 全部; list rows 4..40
ws.cell(row=42, column=5, value="清單範圍：第 4–40 列（下拉選單參照）。總表篩選用第 2 列「全部」+ 第 4 列以下。").font = f_note

def list_ref(name, with_all=False):
    col = L(LIST_COL[name])
    return f"設定!${col}$2:${col}$40" if with_all else f"設定!${col}$4:${col}$40"

def dv(ws, name, rng, allow_blank=True):
    d = DataValidation(type="list", formula1=f"={list_ref(name)}", allow_blank=allow_blank, showErrorMessage=False)
    ws.add_data_validation(d); d.add(rng)
    return d

# ============================================================================ 球員名單
ws = wb.create_sheet("球員名單")
title(ws, "球員名單", 8, "黃底輸入。姓名必須與紀錄表中的寫法完全一致。打擊慣用手 R/L（用於拉打／反方向計算，空白視為 R）。")
ROSTER_COLS = ["背號", "姓名", "主守位", "副守位", "打擊慣用", "投球慣用", "狀態", "備註"]
for i, h in enumerate(ROSTER_COLS):
    hdr(ws, 3, i + 1, h, width=[8, 14, 10, 10, 10, 10, 8, 30][i])
for rr in range(4, 4 + ROSTER_ROWS):
    for cc in range(1, 9):
        put(ws, rr, cc, None, f_input, fill_input)
for i, l in enumerate(ROSTER[:ROSTER_ROWS]):
    put(ws, 4 + i, 2, l["name"], f_input, fill_input)
    put(ws, 4 + i, 3, l["pos"] if l["pos"] not in ("PH", "PR", "") else "", f_input, fill_input)
    put(ws, 4 + i, 7, "現役", f_input, fill_input)
dv(ws, "名單守位", f"C4:D{3 + ROSTER_ROWS}")
ROSTER_NAME = f"球員名單!$B$4:$B${3 + ROSTER_ROWS}"
ws.freeze_panes = "A4"

# ============================================================================ 比賽清單
ws = wb.create_sheet("比賽清單")
title(ws, "比賽清單", 12, "每場一列。黃底輸入；灰色欄自動計算。比賽ID 建議格式 G+YYYYMMDD+-場次，例如 G20251010-01。")
widths = {"比賽ID": 14, "日期": 11, "時間": 7, "年度": 6, "杯賽": 12, "對手": 12, "主客": 6, "場地": 12, "天氣": 8, "紀錄者": 8, "局數": 6, "勝敗": 6,
          "勝投": 9, "敗投": 9, "救援": 9, "中繼": 12, "備註": 20}
for name, col in GM.items():
    hdr(ws, 3, col, name, auto=name not in GAME_INPUT, width=widths.get(name, 8))
GAME_ROWS = 200
def game_formulas(rr):
    A = f"$A{rr}"
    f = {}
    f["年度"] = f'=IF(B{rr}="","",YEAR(B{rr}))'
    f["勝敗"] = f'=IF({A}="","",IF({GL["我隊得分"]}{rr}>{GL["對手得分"]}{rr},"W",IF({GL["我隊得分"]}{rr}<{GL["對手得分"]}{rr},"L","T")))'
    f["我隊得分"] = f'=IF({A}="","",SUMIFS(打席紀錄!${BL["得分"]}$2:${BL["得分"]}${LAST},打席紀錄!$A$2:$A${LAST},{A}))'
    f["對手得分"] = f'=IF({A}="","",SUMIFS(投球紀錄!${PL["失分"]}$2:${PL["失分"]}${LAST},投球紀錄!$A$2:$A${LAST},{A}))'
    f["我隊安打"] = f'=IF({A}="","",SUMIFS(打席紀錄!${BL["安打"]}$2:${BL["安打"]}${LAST},打席紀錄!$A$2:$A${LAST},{A}))'
    f["對手安打"] = f'=IF({A}="","",SUMIFS(投球紀錄!${PL["安打"]}$2:${PL["安打"]}${LAST},投球紀錄!$A$2:$A${LAST},{A}))'
    f["我隊失誤"] = f'=IF({A}="","",SUMIFS(守備紀錄!${FL["失誤E"]}$2:${FL["失誤E"]}${LAST},守備紀錄!$A$2:$A${LAST},{A}))'
    f["對手失誤"] = f'=IF({A}="","",SUMIFS(打席紀錄!${BL["失誤上壘"]}$2:${BL["失誤上壘"]}${LAST},打席紀錄!$A$2:$A${LAST},{A}))'
    f["我隊殘壘"] = f'=IF({A}="","",COUNTIFS(打席紀錄!$A$2:$A${LAST},{A},打席紀錄!${BL["結果代碼"]}$2:${BL["結果代碼"]}${LAST},"L"))'
    for i in range(1, 10):
        f[f"我{i}"] = f'=IF({A}="","",SUMIFS(打席紀錄!${BL["得分"]}$2:${BL["得分"]}${LAST},打席紀錄!$A$2:$A${LAST},{A},打席紀錄!$B$2:$B${LAST},{i}))'
        f[f"對{i}"] = f'=IF({A}="","",SUMIFS(投球紀錄!${PL["失分"]}$2:${PL["失分"]}${LAST},投球紀錄!$A$2:$A${LAST},{A},投球紀錄!$B$2:$B${LAST},{i}))'
    return f
for rr in range(4, 4 + GAME_ROWS):
    fs = game_formulas(rr)
    for name, col in GM.items():
        if name in GAME_INPUT:
            put(ws, rr, col, None, f_input, fill_input, "yyyy-mm-dd" if name == "日期" else ("hh:mm" if name == "時間" else None))
        else:
            put(ws, rr, col, fs[name], f_base, None, "0")
dv(ws, "杯賽清單", f"{GL['杯賽']}4:{GL['杯賽']}{3 + GAME_ROWS}")
dv(ws, "對手清單", f"{GL['對手']}4:{GL['對手']}{3 + GAME_ROWS}")
dv(ws, "主客", f"{GL['主客']}4:{GL['主客']}{3 + GAME_ROWS}")
ws.freeze_panes = "C4"
# seed games
def _time(t):
    try:
        h, m = str(t).split(":"); return dt.time(int(h), int(m))
    except Exception:
        return None
for gi, g in enumerate(GAMES):
    win = next((p["name"] for p in g["pitchers"] if p.get("decision") == "W"), None)
    lose = next((p["name"] for p in g["pitchers"] if p.get("decision") == "L"), None)
    seed = {"比賽ID": g["game_id"], "日期": dt.datetime.strptime(g["date"], "%Y-%m-%d"), "時間": _time(g.get("time")), "杯賽": g["tournament"], "對手": g["opponent"],
            "主客": g["home_away"], "場地": g["venue"], "天氣": g["weather"], "紀錄者": g["recorder"], "局數": g["innings_played"],
            "勝投": win, "敗投": lose, "備註": "由原單場紀錄表轉入；杯賽名稱為假設" + ("；" + "；".join(g["warnings"]) if g.get("warnings") else "")}
    for k, v in seed.items():
        if v is not None:
            ws.cell(row=4 + gi, column=GM[k], value=v)
GAME_LAST = 3 + GAME_ROWS

# ============================================================================ log sheets
def game_lookup(col_letter, rr, as_text=True):
    inner = f'INDEX(比賽清單!${col_letter}$4:${col_letter}${GAME_LAST},MATCH($A{rr},比賽清單!$A$4:$A${GAME_LAST},0))'
    if as_text:
        inner = f'""&{inner}'
    return f'=IF($A{rr}="","",IFERROR({inner},""))'

def build_log(name, inputs, autos, formulas_fn, widths, subtitle):
    ws = wb.create_sheet(name)
    cols = inputs + autos
    for i, h in enumerate(cols):
        hdr(ws, 1, i + 1, h, auto=(i >= len(inputs)), width=widths.get(h, 5 if h.startswith("球") else 7))
    ws.cell(row=1, column=1).comment = Comment(subtitle, "BAFIN")
    n_in = len(inputs)
    for rr in range(2, LAST + 1):
        fs = formulas_fn(rr)
        for i, h in enumerate(cols):
            col = i + 1
            if h in fs:
                put(ws, rr, col, fs[h], f_base, None, None if h == "日期" else "0")
                if h == "日期": ws.cell(row=rr, column=col).number_format = "yyyy-mm-dd"
            elif i < n_in:
                put(ws, rr, col, None, f_input, fill_input)
    ws.freeze_panes = "H2"
    return ws

def pitch_counts(rr):
    rng = f"${P1}{rr}:${P12}{rr}"
    return {
        "好球": f'=COUNTIF({rng},"S")+COUNTIF({rng},"SS")+COUNTIF({rng},"CS")+COUNTIF({rng},"IP")',
        "界外": f'=COUNTIF({rng},"F")',
        "壞球": f'=COUNTIF({rng},"B")',
        "用球數": f'={BL["好球"]}{rr}+{BL["界外"]}{rr}+{BL["壞球"]}{rr}',
        "_揮空": f'COUNTIF({rng},"SS")',
        "_揮棒": f'(COUNTIF({rng},"SS")+COUNTIF({rng},"F")+COUNTIF({rng},"IP"))',
        "_看好球": f'(COUNTIF({rng},"CS")+COUNTIF({rng},"S"))',
    }

def bat_formulas(rr):
    X = f"${BL['打擊結果']}{rr}"; Z = f"${BL['軌跡']}{rr}"; Y = f"${BL['落點']}{rr}"; D = f"${BL['壘上(前)']}{rr}"; G = f"${BL['打者']}{rr}"
    pc = pitch_counts(rr)
    c = lambda k: f"{BL[k]}{rr}"
    f = {k: v for k, v in pc.items() if not k.startswith("_")}
    f["日期"] = game_lookup(GL["日期"], rr, as_text=False)
    f["杯賽"] = game_lookup(GL["杯賽"], rr); f["對手"] = game_lookup(GL["對手"], rr); f["主客"] = game_lookup(GL["主客"], rr); f["勝敗"] = game_lookup(GL["勝敗"], rr)
    f["打席"] = f'=IF(AND({G}<>"",{X}<>""),1,0)'
    f["打數"] = f'=IF({c("打席")}=0,0,IF(OR({X}="保送",{X}="故四",{X}="觸身",{X}="犧觸",{X}="犧牲",{X}="犧飛",{X}="妨礙"),0,1))'
    f["安打"] = f'=IF(OR({X}="一安",{X}="二安",{X}="三安",{X}="全壘打"),1,0)'
    for k, v in [("一安", "一安"), ("二安", "二安"), ("三安", "三安"), ("全壘打", "全壘打"), ("故四", "故四"), ("觸身", "觸身"), ("三振", "三振"),
                 ("犧飛", "犧飛"), ("雙殺", "雙殺"), ("失誤上壘", "失誤")]:
        f[k] = f'=IF({X}="{v}",1,0)'
    f["壘打數"] = f'={c("一安")}+2*{c("二安")}+3*{c("三安")}+4*{c("全壘打")}'
    f["保送"] = f'=IF(OR({X}="保送",{X}="故四"),1,0)'
    f["犧觸"] = f'=IF(OR({X}="犧觸",{X}="犧牲"),1,0)'
    f["得點圈打數"] = f'=IF(AND({c("打數")}=1,OR(ISNUMBER(SEARCH("2",{D})),ISNUMBER(SEARCH("3",{D})))),1,0)'
    f["得點圈安打"] = f'=IF(AND({c("得點圈打數")}=1,{c("安打")}=1),1,0)'
    f["場內球"] = f'=IF(AND({c("打席")}=1,OR({Z}="G",{Z}="F",{Z}="L")),1,0)'
    f["滾地"] = f'=IF(AND({c("場內球")}=1,{Z}="G"),1,0)'
    f["飛球"] = f'=IF(AND({c("場內球")}=1,{Z}="F"),1,0)'
    f["平飛"] = f'=IF(AND({c("場內球")}=1,{Z}="L"),1,0)'
    f["強擊"] = f'=IF(AND({c("場內球")}=1,${BL["強度"]}{rr}="強"),1,0)'
    f["揮空"] = f'={pc["_揮空"]}'
    f["揮棒"] = f'={pc["_揮棒"]}'
    f["看好球"] = f'={pc["_看好球"]}'
    f["首球揮棒"] = f'=IF(AND({c("打席")}=1,OR(${P1}{rr}="SS",${P1}{rr}="F",${P1}{rr}="IP")),1,0)'
    f["優質打席"] = f'=IF({c("打席")}=0,0,IF(OR({c("安打")}=1,{c("保送")}=1,{c("觸身")}=1,{c("犧觸")}=1,{c("犧飛")}=1,${BL["打點"]}{rr}>0,{c("用球數")}>=6,{c("強擊")}=1),1,0)'
    f["慣用手"] = f'=IF({G}="","",IFERROR(IF(INDEX(球員名單!$E$4:$E${3 + ROSTER_ROWS},MATCH({G},{ROSTER_NAME},0))="L","L","R"),"R"))'
    H = c("慣用手")
    # 落點 may be a fielder (1–9) or a gap code: 56 三游 / 78 左中 are the left side, 34 一二 / 89 右中 the right, 46 二游 the middle
    left = f"OR({Y}=5,{Y}=6,{Y}=7,{Y}=56,{Y}=78)"; right = f"OR({Y}=3,{Y}=4,{Y}=9,{Y}=34,{Y}=89)"
    f["拉打"] = f'=IF({c("場內球")}=0,0,IF({H}="L",IF({right},1,0),IF({left},1,0)))'
    f["中間"] = f'=IF({c("場內球")}=0,0,IF(OR({Y}=1,{Y}=2,{Y}=8,{Y}=46),1,0))'
    f["反方向"] = f'=IF({c("場內球")}=0,0,IF({H}="L",IF({left},1,0),IF({right},1,0)))'
    f["首打席"] = f'=IF(AND({G}<>"",COUNTIFS($A$2:$A{rr},$A{rr},${BL["打者"]}$2:${BL["打者"]}{rr},{G})=1),1,0)'
    f["上壘"] = f'={c("安打")}+{c("保送")}+{c("觸身")}'
    return f

def pit_formulas(rr):
    X = f"${PL['打擊結果']}{rr}"; Z = f"${PL['軌跡']}{rr}"; F = f"${PL['投手']}{rr}"; CODE = f"${PL['結果代碼']}{rr}"
    pc = pitch_counts(rr)
    c = lambda k: f"{PL[k]}{rr}"
    f = {k: v for k, v in pc.items() if not k.startswith("_")}
    f["用球數"] = f'={PL["好球"]}{rr}+{PL["界外"]}{rr}+{PL["壞球"]}{rr}'
    f["日期"] = game_lookup(GL["日期"], rr, as_text=False)
    f["杯賽"] = game_lookup(GL["杯賽"], rr); f["對手"] = game_lookup(GL["對手"], rr); f["主客"] = game_lookup(GL["主客"], rr); f["勝敗"] = game_lookup(GL["勝敗"], rr)
    f["打席"] = f'=IF(AND({F}<>"",{X}<>""),1,0)'
    f["打數"] = f'=IF({c("打席")}=0,0,IF(OR({X}="保送",{X}="故四",{X}="觸身",{X}="犧觸",{X}="犧牲",{X}="犧飛",{X}="妨礙"),0,1))'
    f["安打"] = f'=IF(OR({X}="一安",{X}="二安",{X}="三安",{X}="全壘打"),1,0)'
    for k, v in [("二安", "二安"), ("三安", "三安"), ("全壘打", "全壘打"), ("故四", "故四"), ("觸身", "觸身"), ("三振", "三振"), ("犧飛", "犧飛")]:
        f[k] = f'=IF({X}="{v}",1,0)'
    f["保送"] = f'=IF(OR({X}="保送",{X}="故四"),1,0)'
    f["出局數"] = f'=IF(OR({CODE}="I",{CODE}="II",{CODE}="III"),IF(AND({X}="雙殺",OR(${PL["出局(前)"]}{rr}="",${PL["出局(前)"]}{rr}<=1)),2,1),0)'
    f["失分"] = f'=IF(OR({CODE}="R",{CODE}="ER"),1,0)'
    f["自責"] = f'=IF({CODE}="ER",1,0)'
    f["場內球"] = f'=IF(AND({c("打席")}=1,OR({Z}="G",{Z}="F",{Z}="L")),1,0)'
    f["滾地"] = f'=IF(AND({c("場內球")}=1,{Z}="G"),1,0)'
    f["飛球"] = f'=IF(AND({c("場內球")}=1,{Z}="F"),1,0)'
    f["平飛"] = f'=IF(AND({c("場內球")}=1,{Z}="L"),1,0)'
    f["強擊"] = f'=IF(AND({c("場內球")}=1,${PL["強度"]}{rr}="強"),1,0)'
    f["揮空"] = f'={pc["_揮空"]}'; f["揮棒"] = f'={pc["_揮棒"]}'; f["看好球"] = f'={pc["_看好球"]}'
    f["首球好球"] = f'=IF(AND({c("打席")}=1,OR(${P1}{rr}="S",${P1}{rr}="SS",${P1}{rr}="CS",${P1}{rr}="F",${P1}{rr}="IP")),1,0)'
    f["首人次"] = f'=IF(AND({F}<>"",COUNTIFS($A$2:$A{rr},$A{rr},${PL["投手"]}$2:${PL["投手"]}{rr},{F})=1),1,0)'
    f["先發"] = f'=IF(AND({F}<>"",COUNTIF($A$2:$A{rr},$A{rr})=1),1,0)'
    return f

def fld_formulas(rr):
    return {"日期": game_lookup(GL["日期"], rr, as_text=False), "杯賽": game_lookup(GL["杯賽"], rr), "對手": game_lookup(GL["對手"], rr),
            "主客": game_lookup(GL["主客"], rr), "勝敗": game_lookup(GL["勝敗"], rr)}

log_widths = {"比賽ID": 14, "打者": 10, "投手": 10, "對方打者": 10, "打擊結果": 8, "備註": 16, "日期": 11, "杯賽": 10, "對手": 8, "球員": 10, "壘上(前)": 8, "出局(前)": 7}
ws_bat = build_log("打席紀錄", BAT_INPUT, BAT_AUTO, bat_formulas, log_widths, "我隊每個打席一列。A–AI 欄輸入（可從『單場-打擊』貼上值），AJ 以後為自動公式。")
ws_pit = build_log("投球紀錄", PIT_INPUT, PIT_AUTO, pit_formulas, log_widths, "我隊投手面對的每個打席一列。A–AH 欄輸入（可從『單場-投球』貼上值），AI 以後為自動公式。")
ws_fld = build_log("守備紀錄", FLD_INPUT, FLD_AUTO, fld_formulas, log_widths, "每場每位球員一列。")
ws_fld.freeze_panes = "C2"

def add_log_validations(ws, cm, kind):
    last = LAST
    dv(ws, "壘上代碼", f"{L(cm['壘上(前)'])}2:{L(cm['壘上(前)'])}{last}")
    dv(ws, "逐球代碼", f"{P1}2:{P12}{last}")
    dv(ws, "打擊結果", f"{L(cm['打擊結果'])}2:{L(cm['打擊結果'])}{last}")
    dv(ws, "落點", f"{L(cm['落點'])}2:{L(cm['落點'])}{last}")
    dv(ws, "軌跡", f"{L(cm['軌跡'])}2:{L(cm['軌跡'])}{last}")
    dv(ws, "強度", f"{L(cm['強度'])}2:{L(cm['強度'])}{last}")
    dv(ws, "結果代碼", f"{L(cm['結果代碼'])}2:{L(cm['結果代碼'])}{last}")
    if kind == "bat":
        dv(ws, "守位清單", f"{L(cm['守位'])}2:{L(cm['守位'])}{last}")
        d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"{L(cm['打者'])}2:{L(cm['打者'])}{last}")
    else:
        d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"{L(cm['投手'])}2:{L(cm['投手'])}{last}")
add_log_validations(ws_bat, BAT, "bat"); add_log_validations(ws_pit, PIT, "pit")
dv(ws_fld, "守位清單", f"C2:C{LAST}")
d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws_fld.add_data_validation(d); d.add(f"B2:B{LAST}")

# ---- seed logs with the real game
BASES = {0: "無"}
def seed_bat(ws, rows, start=2, game=None):
    game = game or GAME
    for i, r in enumerate(rows):
        rr = start + i
        vals = {"比賽ID": game["game_id"], "局": r["inning"], "出局(前)": r["outs_before"], "棒次": r["order"], "守位": r.get("pos", ""), "打者": r["name"],
                "打擊結果": r["result"], "落點": r["loc"], "軌跡": r["traj"], "強度": r["quality"], "盜壘": r["sb"] or None, "失誤進壘": r["adv_err"] or None,
                "壘死": r["out_on_base"] or None, "得分": r["run"] or None, "打點": r["rbi"] or None, "結果代碼": r["code"], "備註": r["note"]}
        for k, v in vals.items():
            if v not in (None, ""): ws.cell(row=rr, column=BAT[k], value=v)
        for j, p in enumerate(r["pitches"][:PITCH_N]):
            ws.cell(row=rr, column=BAT["球1"] + j, value=p)
def seed_pit(ws, rows, start=2, game=None):
    game = game or GAME
    for i, r in enumerate(rows):
        rr = start + i
        vals = {"比賽ID": game["game_id"], "局": r["inning"], "出局(前)": r["outs_before"], "對方棒次": r["order"], "投手": r["name"],
                "打擊結果": r["result"], "落點": r["loc"], "軌跡": r["traj"], "強度": r["quality"], "被盜壘": r["sb"] or None, "結果代碼": r["code"], "備註": r["note"]}
        for k, v in vals.items():
            if v not in (None, ""): ws.cell(row=rr, column=PIT[k], value=v)
        for j, p in enumerate(r["pitches"][:PITCH_N]):
            ws.cell(row=rr, column=PIT["球1"] + j, value=p)
_b = _p = 2
for g in GAMES:
    seed_bat(ws_bat, g["batting"], _b, g); _b += len(g["batting"])
    seed_pit(ws_pit, g["pitching"], _p, g); _p += len(g["pitching"])
# fielding seed: per game, innings by lineup; errors attributed by recorded location
POSN = {1: "P", 2: "C", 3: "1B", 4: "2B", 5: "3B", 6: "SS", 7: "LF", 8: "CF", 9: "RF"}
def fielding_seed(g):
    err_by_pos, unknown = {}, 0
    for r in g["pitching"]:
        if r["result"] == "失誤":
            if r["loc"]: err_by_pos[POSN[r["loc"]]] = err_by_pos.get(POSN[r["loc"]], 0) + 1
            else: unknown += 1
    innings = g["innings_played"]
    rows = []
    # everyone who took a fielding position in the batting log (subs included); pitchers come from the pitching log
    seen = set()
    for r in g["batting"]:
        pos = r.get("pos") or ""
        if not r["name"] or r["name"] in seen or pos in ("DH", "PH", "PR", "", "P"):
            continue
        seen.add(r["name"])
        e = err_by_pos.get(pos, 0)
        rows.append({"比賽ID": g["game_id"], "球員": r["name"], "守位": pos, "局數": innings, "失誤E": e or None, "備註": "失誤依原表落點推定" if e else "由打席紀錄推定"})
    # pitchers: innings from their outs
    outs = {}
    for r in g["pitching"]:
        if r["code"] in ("I", "II", "III"):
            outs[r["name"]] = outs.get(r["name"], 0) + (2 if r["result"] == "雙殺" and r.get("outs_before", 0) <= 1 else 1)
    for p in g["pitchers"]:
        ip = round(outs.get(p["name"], 0) / 3, 1)
        e = err_by_pos.get("P", 0) if p is g["pitchers"][0] else None
        rows.append({"比賽ID": g["game_id"], "球員": p["name"], "守位": "P", "局數": ip, "失誤E": e or None, "備註": p.get("role", "")})
    if unknown and rows:
        rows[0]["備註"] = (rows[0]["備註"] or "") + f"；另有 {unknown} 次失誤原表未記落點，未歸屬個人"
    return rows
FLD_SEED = fielding_seed(GAME)
_f = 2
for g in GAMES:
    for row in fielding_seed(g):
        for k, v in row.items():
            if v not in (None, ""): ws_fld.cell(row=_f, column=FLD[k], value=v)
        _f += 1

# ============================================================================ 總表
ws = wb.create_sheet("總表")
title(ws, "總表：全時期統計（依篩選條件即時計算）", 20, "黃色格為篩選條件：留空或選「全部」代表不限。守位篩選只影響打擊與守備表；勝敗／主客／對手／杯賽／日期影響全部。")
ws.column_dimensions["A"].width = 3; ws.column_dimensions["B"].width = 12; ws.column_dimensions["C"].width = 14; ws.column_dimensions["D"].width = 3
FILTERS = [("杯賽", "杯賽清單"), ("起始日期", None), ("結束日期", None), ("守位", "守位清單"), ("對手", "對手清單"), ("主客", "主客"), ("勝敗", None)]
FR = {}
for i, (name, lst) in enumerate(FILTERS):
    rr = 4 + i
    put(ws, rr, 2, name, f_bold, fill_band)
    c = put(ws, rr, 3, None, f_input, fill_filter, "yyyy-mm-dd" if "日期" in name else None, center)
    FR[name] = f"$C${rr}"
    if lst:
        d = DataValidation(type="list", formula1=f"={list_ref(lst, with_all=True)}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"C{rr}")
    if name == "勝敗":
        d = DataValidation(type="list", formula1='"全部,W,L,T"', allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"C{rr}")
ws["C4"] = "全部"; ws["C7"] = "全部"; ws["C8"] = "全部"; ws["C9"] = "全部"; ws["C10"] = "全部"
# criteria helper cells (column F, labelled)
put(ws, 3, 6, "條件字串（勿改）", f_note, b=False)
CR = {}
crit_rows = [("杯賽", f'=IF(OR({FR["杯賽"]}="",{FR["杯賽"]}="全部"),"<>|ALL|",{FR["杯賽"]})'),
             ("起始", f'=IF({FR["起始日期"]}="",DATE(1900,1,1),{FR["起始日期"]})'),
             ("結束", f'=IF({FR["結束日期"]}="",DATE(2999,12,31),{FR["結束日期"]})'),
             ("守位", f'=IF(OR({FR["守位"]}="",{FR["守位"]}="全部"),"<>|ALL|",{FR["守位"]})'),
             ("對手", f'=IF(OR({FR["對手"]}="",{FR["對手"]}="全部"),"<>|ALL|",{FR["對手"]})'),
             ("主客", f'=IF(OR({FR["主客"]}="",{FR["主客"]}="全部"),"<>|ALL|",{FR["主客"]})'),
             ("勝敗", f'=IF(OR({FR["勝敗"]}="",{FR["勝敗"]}="全部"),"<>|ALL|",{FR["勝敗"]})')]
for i, (k, fml) in enumerate(crit_rows):
    rr = 4 + i
    put(ws, rr, 5, k, f_note, b=False); c = put(ws, rr, 6, fml, f_note, b=False); CR[k] = f"$F${rr}"
    if k in ("起始", "結束"): c.number_format = "yyyy-mm-dd"
ws.column_dimensions["E"].width = 6; ws.column_dimensions["F"].width = 12

def crit(sheet, cm_letters, with_pos=False):
    """Filter criteria suffix for SUMIFS over a log sheet."""
    s = (f',{sheet}!${cm_letters["杯賽"]}$2:${cm_letters["杯賽"]}${LAST},{CR["杯賽"]}'
         f',{sheet}!${cm_letters["日期"]}$2:${cm_letters["日期"]}${LAST},">="&{CR["起始"]}'
         f',{sheet}!${cm_letters["日期"]}$2:${cm_letters["日期"]}${LAST},"<="&{CR["結束"]}'
         f',{sheet}!${cm_letters["對手"]}$2:${cm_letters["對手"]}${LAST},{CR["對手"]}'
         f',{sheet}!${cm_letters["主客"]}$2:${cm_letters["主客"]}${LAST},{CR["主客"]}'
         f',{sheet}!${cm_letters["勝敗"]}$2:${cm_letters["勝敗"]}${LAST},{CR["勝敗"]}')
    if with_pos:
        s += f',{sheet}!${cm_letters["守位"]}$2:${cm_letters["守位"]}${LAST},{CR["守位"]}'
    return s

def S(sheet, letters, col, who_col, who, with_pos=False, extra=""):
    return f'SUMIFS({sheet}!${letters[col]}$2:${letters[col]}${LAST},{sheet}!${letters[who_col]}$2:${letters[who_col]}${LAST},{who}{crit(sheet, letters, with_pos)}{extra})'

def ST(sheet, letters, col, with_pos=False, extra=""):
    """Team-level sum (no player criterion)."""
    return f'SUMIFS({sheet}!${letters[col]}$2:${letters[col]}${LAST},{sheet}!$A$2:$A${LAST},"<>"{crit(sheet, letters, with_pos)}{extra})'

# game-level criteria on 比賽清單
GCRIT = (f',比賽清單!${GL["杯賽"]}$4:${GL["杯賽"]}${GAME_LAST},{CR["杯賽"]}'
         f',比賽清單!${GL["日期"]}$4:${GL["日期"]}${GAME_LAST},">="&{CR["起始"]}'
         f',比賽清單!${GL["日期"]}$4:${GL["日期"]}${GAME_LAST},"<="&{CR["結束"]}'
         f',比賽清單!${GL["對手"]}$4:${GL["對手"]}${GAME_LAST},{CR["對手"]}'
         f',比賽清單!${GL["主客"]}$4:${GL["主客"]}${GAME_LAST},{CR["主客"]}'
         f',比賽清單!${GL["勝敗"]}$4:${GL["勝敗"]}${GAME_LAST},{CR["勝敗"]}')
def GC(col, extra=""):
    return f'COUNTIFS(比賽清單!$A$4:$A${GAME_LAST},"<>"{GCRIT}{extra})' if col is None else \
           f'SUMIFS(比賽清單!${GL[col]}$4:${GL[col]}${GAME_LAST},比賽清單!$A$4:$A${GAME_LAST},"<>"{GCRIT}{extra})'

# ---- team block (rows 13-16)
put(ws, 12, 2, "球隊總覽", f_bold, fill_band); ws.merge_cells("B12:T12")
team_items = [
    ("場次", f'={GC(None)}', "0"),
    ("勝", f'=COUNTIFS(比賽清單!${GL["勝敗"]}$4:${GL["勝敗"]}${GAME_LAST},"W"{GCRIT})', "0"),
    ("敗", f'=COUNTIFS(比賽清單!${GL["勝敗"]}$4:${GL["勝敗"]}${GAME_LAST},"L"{GCRIT})', "0"),
    ("和", f'=COUNTIFS(比賽清單!${GL["勝敗"]}$4:${GL["勝敗"]}${GAME_LAST},"T"{GCRIT})', "0"),
    ("勝率", '=IFERROR(C14/(C14+D14),"")', "0.000"),
    ("得分", f'={GC("我隊得分")}', "0"),
    ("失分", f'={GC("對手得分")}', "0"),
    ("得失分差", "=G14-H14", "+0;-0;0"),
    ("畢氏期望勝率", f'=IFERROR(G14^{PARAM["畢氏指數"]}/(G14^{PARAM["畢氏指數"]}+H14^{PARAM["畢氏指數"]}),"")', "0.000"),
    ("團隊AVG", f'=IFERROR({ST("打席紀錄", BL, "安打", True)}/{ST("打席紀錄", BL, "打數", True)},"")', "0.000"),
    ("團隊OBP", f'=IFERROR({ST("打席紀錄", BL, "上壘", True)}/({ST("打席紀錄", BL, "打數", True)}+{ST("打席紀錄", BL, "保送", True)}+{ST("打席紀錄", BL, "觸身", True)}+{ST("打席紀錄", BL, "犧飛", True)}),"")', "0.000"),
    ("團隊SLG", f'=IFERROR({ST("打席紀錄", BL, "壘打數", True)}/{ST("打席紀錄", BL, "打數", True)},"")', "0.000"),
    ("團隊OPS", '=IFERROR(L14+M14,"")', "0.000"),
    ("團隊ERA", f'=IFERROR({ST("投球紀錄", PL, "自責")}*{PARAM["每場局數"]}/({ST("投球紀錄", PL, "出局數")}/3),"")', "0.00"),
    ("團隊WHIP", f'=IFERROR(({ST("投球紀錄", PL, "保送")}+{ST("投球紀錄", PL, "安打")})/({ST("投球紀錄", PL, "出局數")}/3),"")', "0.00"),
    ("守備率", f'=IFERROR(({ST("守備紀錄", FL, "刺殺PO", True)}+{ST("守備紀錄", FL, "助殺A", True)})/({ST("守備紀錄", FL, "刺殺PO", True)}+{ST("守備紀錄", FL, "助殺A", True)}+{ST("守備紀錄", FL, "失誤E", True)}),"")', "0.000"),
    ("盜壘", f'={ST("打席紀錄", BL, "盜壘", True)}', "0"),
    ("殘壘", f'={GC("我隊殘壘")}', "0"),
]
for i, (name, fml, fmt) in enumerate(team_items):
    col = 2 + i
    hdr(ws, 13, col, name); put(ws, 14, col, fml, f_bold, None, fmt, center)
    if col > 4: ws.column_dimensions[L(col)].width = max(ws.column_dimensions[L(col)].width or 0, 9)
# ---- runs by inning (rows 16-18)
put(ws, 16, 2, "逐局得失分", f_bold, fill_band); ws.merge_cells("B16:L16")
hdr(ws, 17, 2, "局"); hdr(ws, 18, 2, "我隊得分"); hdr(ws, 19, 2, "對手得分")
for i in range(1, 10):
    col = 2 + i
    put(ws, 17, col, i, f_bold, fill_band, "0", center)
    put(ws, 18, col, f'={ST("打席紀錄", BL, "得分", True, extra=f",打席紀錄!$B$2:$B${LAST},{i}")}', f_base, None, "0", center)
    put(ws, 19, col, f'={ST("投球紀錄", PL, "失分", False, extra=f",投球紀錄!$B$2:$B${LAST},{i}")}', f_base, None, "0", center)
put(ws, 17, 12, "合計", f_bold, fill_band, None, center); put(ws, 18, 12, "=SUM(C18:K18)", f_bold, None, "0", center); put(ws, 19, 12, "=SUM(C19:K19)", f_bold, None, "0", center)

# ---- batting table
BAT_START = 22
put(ws, BAT_START - 1, 2, "打擊成績（守位篩選 = 該打席的守位）", f_bold, fill_band); ws.merge_cells(start_row=BAT_START - 1, start_column=2, end_row=BAT_START - 1, end_column=20)
def bat_stat_cols():
    n = "$B{r}"
    b = lambda col: S("打席紀錄", BL, col, "打者", n, True)
    cols = [
        ("姓名", None, None), ("主守位", '=IF($B{r}="","",IFERROR(INDEX(球員名單!$C$4:$C$' + str(3 + ROSTER_ROWS) + ',MATCH($B{r},' + ROSTER_NAME + ',0)),""))', None),
        ("G", "=" + b("首打席"), "0"), ("PA", "=" + b("打席"), "0"), ("AB", "=" + b("打數"), "0"), ("R", "=" + b("得分"), "0"), ("H", "=" + b("安打"), "0"),
        ("1B", "=" + b("一安"), "0"), ("2B", "=" + b("二安"), "0"), ("3B", "=" + b("三安"), "0"), ("HR", "=" + b("全壘打"), "0"), ("TB", "=" + b("壘打數"), "0"),
        ("RBI", "=" + b("打點"), "0"), ("BB", "=" + b("保送"), "0"), ("IBB", "=" + b("故四"), "0"), ("HBP", "=" + b("觸身"), "0"), ("SO", "=" + b("三振"), "0"),
        ("SH", "=" + b("犧觸"), "0"), ("SF", "=" + b("犧飛"), "0"), ("GIDP", "=" + b("雙殺"), "0"), ("ROE", "=" + b("失誤上壘"), "0"),
        ("SB", "=" + b("盜壘"), "0"), ("CS", "=" + b("盜壘失敗"), "0"), ("SB%", '=IFERROR({SB}/({SB}+{CS}),"")', "0.0%"),
        ("AVG", '=IFERROR({H}/{AB},"")', "0.000"), ("OBP", '=IFERROR(({H}+{BB}+{HBP})/({AB}+{BB}+{HBP}+{SF}),"")', "0.000"),
        ("SLG", '=IFERROR({TB}/{AB},"")', "0.000"), ("OPS", '=IFERROR({OBP}+{SLG},"")', "0.000"),
        ("OPS+", '=IFERROR(ROUND(100*({OBP}/{TEAMOBP}+{SLG}/{TEAMSLG}-1),0),"")', "0"), ("ISO", '=IFERROR({SLG}-{AVG},"")', "0.000"),
        ("BABIP", '=IFERROR(({H}-{HR})/({AB}-{SO}-{HR}+{SF}),"")', "0.000"),
        ("wOBA", '=IFERROR((' + PARAM["wBB"] + '*({BB}-{IBB})+' + PARAM["wHBP"] + '*{HBP}+' + PARAM["w1B"] + '*{1B}+' + PARAM["w2B"] + '*{2B}+' + PARAM["w3B"] + '*{3B}+' + PARAM["wHR"] + '*{HR})/({AB}+{BB}-{IBB}+{SF}+{HBP}),"")', "0.000"),
        ("K%", '=IFERROR({SO}/{PA},"")', "0.0%"), ("BB%", '=IFERROR({BB}/{PA},"")', "0.0%"),
        ("RISP AVG", "=IFERROR(" + b("得點圈安打") + "/" + b("得點圈打數") + ',"")', "0.000"),
        ("QAB%", "=IFERROR(" + b("優質打席") + '/{PA},"")', "0.0%"),
        ("P/PA", "=IFERROR(" + b("用球數") + '/{PA},"")', "0.00"),
        ("Whiff%", "=IFERROR(" + b("揮空") + "/" + b("揮棒") + ',"")', "0.0%"),
        ("GB%", "=IFERROR(" + b("滾地") + "/" + b("場內球") + ',"")', "0.0%"),
        ("FB%", "=IFERROR(" + b("飛球") + "/" + b("場內球") + ',"")', "0.0%"),
        ("LD%", "=IFERROR(" + b("平飛") + "/" + b("場內球") + ',"")', "0.0%"),
        ("Hard%", "=IFERROR(" + b("強擊") + "/" + b("場內球") + ',"")', "0.0%"),
        ("Pull%", "=IFERROR(" + b("拉打") + "/" + b("場內球") + ',"")', "0.0%"),
        ("Oppo%", "=IFERROR(" + b("反方向") + "/" + b("場內球") + ',"")', "0.0%"),
        ("OPS排名", '=IF(OR({OPS}="",{PA}<{MINPA}),"",RANK({OPS},{OPSRANGE},0))', "0"),
    ]
    return cols
BATC = bat_stat_cols()
BAT_LET = {name: L(2 + i) for i, (name, _, _) in enumerate(BATC)}
MINPA_CELL = "$C$" + str(BAT_START)  # min PA for ranking, placed in header row? use a labelled cell
put(ws, BAT_START - 1, 22, "排名最低打席數", f_note, b=False); put(ws, BAT_START - 1, 24, 5, f_input, fill_input, "0", center)
MINPA = f"$X${BAT_START - 1}"
for i, (name, _, _) in enumerate(BATC):
    hdr(ws, BAT_START, 2 + i, name, width=6 if len(name) <= 3 else 8)
ws.column_dimensions["B"].width = 12
first, last = BAT_START + 1, BAT_START + ROSTER_ROWS
for k in range(ROSTER_ROWS):
    r = first + k
    put(ws, r, 2, f'=IF(球員名單!$B${4 + k}="","",球員名單!$B${4 + k})', f_link, fill_band if k % 2 else None)
    for i, (name, fml, fmt) in enumerate(BATC):
        if fml is None: continue
        refs = {n: f"{BAT_LET[n]}{r}" for n in BAT_LET}
        refs["r"] = r; refs["MINPA"] = MINPA; refs["OPSRANGE"] = f"${BAT_LET['OPS']}${first}:${BAT_LET['OPS']}${last}"
        refs["TEAMOBP"] = f"${BAT_LET['OBP']}${last + 1}"; refs["TEAMSLG"] = f"${BAT_LET['SLG']}${last + 1}"
        f = fml.replace("{", "\x00").replace("}", "\x01")
        for key, val in refs.items():
            f = f.replace(f"\x00{key}\x01", str(val))
        f = f.replace("\x00", "{").replace("\x01", "}")
        if name not in ("主守位",):
            f = f'=IF($B{r}="","",{f[1:]})'
        put(ws, r, 2 + i, f, f_base, fill_band if k % 2 else None, fmt, center)
# totals
tr = last + 1
put(ws, tr, 2, "球隊合計", f_bold, fill_total)
for i, (name, fml, fmt) in enumerate(BATC):
    col = 2 + i; let = L(col)
    if name in ("姓名", "主守位", "OPS排名"): put(ws, tr, col, None, f_bold, fill_total); continue
    if name == "OPS+": put(ws, tr, col, 100, f_bold, fill_total, "0", center); continue
    if fmt == "0":
        put(ws, tr, col, f"=SUM({let}{first}:{let}{last})", f_bold, fill_total, fmt, center)
    else:
        # recompute rate from totals row
        refs = {n: f"{BAT_LET[n]}{tr}" for n in BAT_LET}
        f = fml.replace("{", "\x00").replace("}", "\x01")
        # rate formulas that rely on S(...) per-player helper sums: replace with team sums
        if "打席紀錄" in fml:
            f = fml.replace("$B{r}", '"<>"').replace("打者$2", "比賽ID$2")  # crude but exact: SUMIFS on 比賽ID<>""
            f = f.replace("打席紀錄!$" + BL["打者"] + "$2:$" + BL["打者"] + "$" + str(LAST), "打席紀錄!$A$2:$A$" + str(LAST))
            f = f.replace("{", "\x00").replace("}", "\x01")
        for key, val in refs.items():
            f = f.replace(f"\x00{key}\x01", str(val))
        f = f.replace("\x00", "{").replace("\x01", "}")
        put(ws, tr, col, f, f_bold, fill_total, fmt, center)
for name in ("AVG", "OBP", "SLG", "OPS", "wOBA"):
    let = BAT_LET[name]
    ws.conditional_formatting.add(f"{let}{first}:{let}{last}", ColorScaleRule(start_type="min", start_color="FFFFFF", end_type="max", end_color="7FC8A9"))
ws.auto_filter.ref = f"B{BAT_START}:{L(1 + len(BATC))}{last}"

# ---- pitching table
PIT_START = tr + 3
put(ws, PIT_START - 1, 2, "投球成績（不受守位篩選影響）", f_bold, fill_band); ws.merge_cells(start_row=PIT_START - 1, start_column=2, end_row=PIT_START - 1, end_column=20)
put(ws, PIT_START - 1, 22, "排名最低局數", f_note, b=False); put(ws, PIT_START - 1, 24, 3, f_input, fill_input, "0", center)
MINIP = f"$X${PIT_START - 1}"
def pit_stat_cols():
    n = "$B{r}"
    p = lambda col: S("投球紀錄", PL, col, "投手", n)
    dec = lambda col: f'COUNTIFS(比賽清單!${GL[col]}$4:${GL[col]}${GAME_LAST},{n}{GCRIT})'
    hold = f'COUNTIFS(比賽清單!${GL["中繼"]}$4:${GL["中繼"]}${GAME_LAST},"*"&{n}&"*"{GCRIT})'
    IPn = PARAM["每場局數"]
    cols = [
        ("姓名", None, None),
        ("G", "=" + p("首人次"), "0"), ("GS", "=" + p("先發"), "0"), ("W", "=" + dec("勝投"), "0"), ("L", "=" + dec("敗投"), "0"), ("SV", "=" + dec("救援"), "0"), ("HLD", "=" + hold, "0"),
        ("出局數", "=" + p("出局數"), "0"), ("IP", '=INT({出局數}/3)+MOD({出局數},3)/10', "0.0"),
        ("BF", "=" + p("打席"), "0"), ("PC", "=" + p("用球數"), "0"), ("好球", "=" + p("好球") + "+" + p("界外"), "0"), ("壞球", "=" + p("壞球"), "0"),
        ("Strike%", '=IFERROR({好球}/{PC},"")', "0.0%"),
        ("K", "=" + p("三振"), "0"), ("BB", "=" + p("保送"), "0"), ("IBB", "=" + p("故四"), "0"), ("HBP", "=" + p("觸身"), "0"), ("H", "=" + p("安打"), "0"),
        ("2B", "=" + p("二安"), "0"), ("3B", "=" + p("三安"), "0"), ("HR", "=" + p("全壘打"), "0"), ("R", "=" + p("失分"), "0"), ("ER", "=" + p("自責"), "0"),
        ("WP", "=" + p("暴投"), "0"), ("SBA", "=" + p("被盜壘"), "0"), ("CS", "=" + p("阻殺"), "0"), ("PK", "=" + p("牽制出局"), "0"),
        ("ERA", '=IFERROR({ER}*' + IPn + '/({出局數}/3),"")', "0.00"), ("WHIP", '=IFERROR(({BB}+{H})/({出局數}/3),"")', "0.00"),
        ("K/9", '=IFERROR({K}*9/({出局數}/3),"")', "0.00"), ("BB/9", '=IFERROR({BB}*9/({出局數}/3),"")', "0.00"), ("K/BB", '=IFERROR({K}/{BB},"")', "0.00"),
        ("K%", '=IFERROR({K}/{BF},"")', "0.0%"), ("BB%", '=IFERROR({BB}/{BF},"")', "0.0%"),
        ("OppAVG", "=IFERROR({H}/" + p("打數") + ',"")', "0.000"),
        ("OppOBP", "=IFERROR(({H}+{BB}+{HBP})/(" + p("打數") + "+{BB}+{HBP}+" + p("犧飛") + '),"")', "0.000"),
        ("BABIP", "=IFERROR(({H}-{HR})/(" + p("打數") + "-{K}-{HR}+" + p("犧飛") + '),"")', "0.000"),
        ("FIP", '=IFERROR((13*{HR}+3*({BB}+{HBP})-2*{K})/({出局數}/3)+' + PARAM["FIP常數"] + ',"")', "0.00"),
        ("GB%", "=IFERROR(" + p("滾地") + "/" + p("場內球") + ',"")', "0.0%"),
        ("Whiff%", "=IFERROR(" + p("揮空") + "/" + p("揮棒") + ',"")', "0.0%"),
        ("CSW%", "=IFERROR((" + p("看好球") + "+" + p("揮空") + ')/{PC},"")', "0.0%"),
        ("F-Strike%", "=IFERROR(" + p("首球好球") + '/{BF},"")', "0.0%"),
        ("P/IP", '=IFERROR({PC}/({出局數}/3),"")', "0.0"),
        ("LOB%", '=IFERROR(MAX(0,MIN(1,({H}+{BB}+{HBP}-{R})/({H}+{BB}+{HBP}-1.4*{HR}))),"")', "0.0%"),
        ("ERA排名", '=IF(OR({ERA}="",{出局數}/3<{MINIP}),"",RANK({ERA},{ERARANGE},1))', "0"),
    ]
    return cols
PITC = pit_stat_cols()
PIT_LET = {name: L(2 + i) for i, (name, _, _) in enumerate(PITC)}
for i, (name, _, _) in enumerate(PITC):
    hdr(ws, PIT_START, 2 + i, name)
pfirst, plast = PIT_START + 1, PIT_START + ROSTER_ROWS
def fill_formula(fml, refs):
    f = fml.replace("{", "\x00").replace("}", "\x01")
    for key, val in refs.items():
        f = f.replace(f"\x00{key}\x01", str(val))
    return f.replace("\x00", "{").replace("\x01", "}")
for k in range(ROSTER_ROWS):
    r = pfirst + k
    put(ws, r, 2, f'=IF(球員名單!$B${4 + k}="","",球員名單!$B${4 + k})', f_link, fill_band if k % 2 else None)
    for i, (name, fml, fmt) in enumerate(PITC):
        if fml is None: continue
        refs = {n: f"{PIT_LET[n]}{r}" for n in PIT_LET}; refs["r"] = r; refs["MINIP"] = MINIP
        refs["ERARANGE"] = f"${PIT_LET['ERA']}${pfirst}:${PIT_LET['ERA']}${plast}"
        f = fill_formula(fml, refs)
        put(ws, r, 2 + i, f'=IF($B{r}="","",{f[1:]})', f_base, fill_band if k % 2 else None, fmt, center)
ptr = plast + 1
put(ws, ptr, 2, "球隊合計", f_bold, fill_total)
for i, (name, fml, fmt) in enumerate(PITC):
    col = 2 + i; let = L(col)
    if name in ("姓名", "ERA排名"): put(ws, ptr, col, None, f_bold, fill_total); continue
    if fmt == "0" and "SUMIFS" in (fml or "") or name in ("G", "GS", "W", "L", "SV", "HLD"):
        put(ws, ptr, col, f"=SUM({let}{pfirst}:{let}{plast})", f_bold, fill_total, fmt, center); continue
    refs = {n: f"{PIT_LET[n]}{ptr}" for n in PIT_LET}; refs["r"] = ptr
    f = fml
    if "投球紀錄" in f:
        f = f.replace("$B{r}", '"<>"').replace("投球紀錄!$" + PL["投手"] + "$2:$" + PL["投手"] + "$" + str(LAST), "投球紀錄!$A$2:$A$" + str(LAST))
    f = fill_formula(f, refs)
    put(ws, ptr, col, f, f_bold, fill_total, fmt, center)
for name in ("ERA", "WHIP", "FIP"):
    let = PIT_LET[name]
    ws.conditional_formatting.add(f"{let}{pfirst}:{let}{plast}", ColorScaleRule(start_type="min", start_color="7FC8A9", end_type="max", end_color="FFFFFF"))

# ---- fielding table
FLD_START = ptr + 3
put(ws, FLD_START - 1, 2, "守備成績（守位篩選 = 守備紀錄的守位）", f_bold, fill_band); ws.merge_cells(start_row=FLD_START - 1, start_column=2, end_row=FLD_START - 1, end_column=16)
def fld_stat_cols():
    n = "$B{r}"
    q = lambda col: S("守備紀錄", FL, col, "球員", n, True)
    cnt = f'COUNTIFS(守備紀錄!${FL["球員"]}$2:${FL["球員"]}${LAST},{n}{crit("守備紀錄", FL, True)})'
    return [
        ("姓名", None, None), ("G", "=" + cnt, "0"), ("Inn", "=" + q("局數"), "0.0"), ("PO", "=" + q("刺殺PO"), "0"), ("A", "=" + q("助殺A"), "0"),
        ("E", "=" + q("失誤E"), "0"), ("DP", "=" + q("雙殺DP"), "0"), ("TC", "={PO}+{A}+{E}", "0"), ("FPCT", '=IFERROR(({PO}+{A})/{TC},"")', "0.000"),
        ("RF/G", '=IFERROR(({PO}+{A})/{G},"")', "0.00"), ("PB", "=" + q("捕逸PB"), "0"), ("SB", "=" + q("被盜壘SB"), "0"), ("CS", "=" + q("阻殺CS"), "0"),
        ("CS%", '=IFERROR({CS}/({SB}+{CS}),"")', "0.0%"),
    ]
FLDC = fld_stat_cols()
FLD_LET = {name: L(2 + i) for i, (name, _, _) in enumerate(FLDC)}
for i, (name, _, _) in enumerate(FLDC):
    hdr(ws, FLD_START, 2 + i, name)
ffirst, flast = FLD_START + 1, FLD_START + ROSTER_ROWS
for k in range(ROSTER_ROWS):
    r = ffirst + k
    put(ws, r, 2, f'=IF(球員名單!$B${4 + k}="","",球員名單!$B${4 + k})', f_link, fill_band if k % 2 else None)
    for i, (name, fml, fmt) in enumerate(FLDC):
        if fml is None: continue
        refs = {n: f"{FLD_LET[n]}{r}" for n in FLD_LET}; refs["r"] = r
        f = fill_formula(fml, refs)
        put(ws, r, 2 + i, f'=IF($B{r}="","",{f[1:]})', f_base, fill_band if k % 2 else None, fmt, center)
ftr = flast + 1
put(ws, ftr, 2, "球隊合計", f_bold, fill_total)
for i, (name, fml, fmt) in enumerate(FLDC):
    col = 2 + i; let = L(col)
    if name == "姓名": continue
    if fmt in ("0", "0.0"):
        put(ws, ftr, col, f"=SUM({let}{ffirst}:{let}{flast})", f_bold, fill_total, fmt, center)
    else:
        refs = {n: f"{FLD_LET[n]}{ftr}" for n in FLD_LET}
        put(ws, ftr, col, fill_formula(fml, refs), f_bold, fill_total, fmt, center)
ws.freeze_panes = "C12"
ws.sheet_view.zoomScale = 90

# ============================================================================ 單場 templates
ws = wb.create_sheet("單場-摘要")
title(ws, "單場紀錄模板：比賽摘要", 20, "複製三張『單場-』工作表記錄新比賽。黃底輸入；其餘由『單場-打擊』『單場-投球』自動計算。C2 的比賽ID 要和『比賽清單』一致。")
for col, w in zip("ABCDEFGHIJKLMNOPQRSTUV", [3, 10, 14, 10, 12, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]):
    ws.column_dimensions[col].width = w
meta = [("比賽ID", "G20251010-01"), ("日期", dt.datetime(2025, 10, 10)), ("時間", dt.time(11, 40)), ("杯賽", "友誼賽"), ("對手", "群風"), ("主客", "主"),
        ("場地", "台大棒球場"), ("天氣", "大晴天"), ("紀錄者", "王廷宇"), ("局數", 5), ("人數", 13), ("",""),
        ("勝投", next((p["name"] for p in GAME["pitchers"] if p.get("decision") == "W"), None)),
        ("敗投", next((p["name"] for p in GAME["pitchers"] if p.get("decision") == "L"), None)), ("救援", None)]
for i, (k, v) in enumerate(meta):
    if not k: continue
    rr = 2 + (i % 6); cc = 2 + (i // 6) * 3
    put(ws, rr, cc, k, f_bold, fill_band); c = put(ws, rr, cc + 1, v, f_input, fill_input, "yyyy-mm-dd" if k == "日期" else ("hh:mm" if k == "時間" else None), center)
GID = "$C$2"
# line score
LS = 9
put(ws, LS, 2, "隊名", f_h, fill_h, align=center)
for i in range(1, 10): hdr(ws, LS, 2 + i, i)
for j, h in enumerate(["R", "H", "E", "LOB"]): hdr(ws, LS, 12 + j, h)
put(ws, LS + 1, 2, "=$C$6", f_link, None, None, center); put(ws, LS + 2, 2, PARAM["球隊名稱"].replace("設定!", "=設定!"), f_link, None, None, center)
BP = "'單場-打擊'"; PP = "'單場-投球'"
TROWS = TEMPLATE_PA_ROWS + 1
for i in range(1, 10):
    put(ws, LS + 1, 2 + i, f'=SUMIFS({PP}!${PL["失分"]}$2:${PL["失分"]}${TROWS},{PP}!$B$2:$B${TROWS},{i})', f_base, None, "0", center)
    put(ws, LS + 2, 2 + i, f'=SUMIFS({BP}!${BL["得分"]}$2:${BL["得分"]}${TROWS},{BP}!$B$2:$B${TROWS},{i})', f_base, None, "0", center)
put(ws, LS + 1, 12, f"=SUM(C{LS + 1}:K{LS + 1})", f_bold, None, "0", center); put(ws, LS + 2, 12, f"=SUM(C{LS + 2}:K{LS + 2})", f_bold, None, "0", center)
put(ws, LS + 1, 13, f'=SUM({PP}!${PL["安打"]}$2:${PL["安打"]}${TROWS})', f_base, None, "0", center); put(ws, LS + 2, 13, f'=SUM({BP}!${BL["安打"]}$2:${BL["安打"]}${TROWS})', f_base, None, "0", center)
put(ws, LS + 1, 14, f'=SUM({BP}!${BL["失誤上壘"]}$2:${BL["失誤上壘"]}${TROWS})', f_base, None, "0", center); put(ws, LS + 2, 14, f"=SUM(G{LS + 22}:G{LS + 37})", f_base, None, "0", center)
put(ws, LS + 1, 15, f'=COUNTIF({PP}!${PL["結果代碼"]}$2:${PL["結果代碼"]}${TROWS},"L")', f_base, None, "0", center); put(ws, LS + 2, 15, f'=COUNTIF({BP}!${BL["結果代碼"]}$2:${BL["結果代碼"]}${TROWS},"L")', f_base, None, "0", center)
put(ws, LS + 3, 2, "勝敗", f_bold, fill_band); put(ws, LS + 3, 3, f'=IF(L{LS + 2}>L{LS + 1},"W",IF(L{LS + 2}<L{LS + 1},"L","T"))', f_bold, None, None, center)
# lineup + batting line
LU = LS + 5
put(ws, LU - 1, 2, "打擊成績（由『單場-打擊』自動計算）", f_bold, fill_band); ws.merge_cells(start_row=LU - 1, start_column=2, end_row=LU - 1, end_column=18)
LU_COLS = ["棒次", "守位", "球員", "PA", "AB", "R", "H", "2B", "3B", "HR", "RBI", "BB", "HBP", "SO", "SB", "AVG", "OBP", "SLG", "OPS", "用球數"]
for i, h in enumerate(LU_COLS): hdr(ws, LU, 2 + i, h, auto=i >= 3)
def tb(col, r):  # sum helper col of template batting for player in D{r}
    return f'SUMIFS({BP}!${BL[col]}$2:${BL[col]}${TROWS},{BP}!${BL["打者"]}$2:${BL["打者"]}${TROWS},$D{r})'
for k in range(15):
    r = LU + 1 + k
    put(ws, r, 2, None, f_input, fill_input, "0", center); put(ws, r, 3, None, f_input, fill_input, None, center); put(ws, r, 4, None, f_input, fill_input)
    fs = [tb("打席", r), tb("打數", r), tb("得分", r), tb("安打", r), tb("二安", r), tb("三安", r), tb("全壘打", r), tb("打點", r), tb("保送", r), tb("觸身", r), tb("三振", r), tb("盜壘", r)]
    for i, f in enumerate(fs):
        put(ws, r, 5 + i, f'=IF($D{r}="","",{f})', f_base, None, "0", center)
    put(ws, r, 17, f'=IF($D{r}="","",IFERROR(H{r}/F{r},""))', f_base, None, "0.000", center)
    put(ws, r, 18, f'=IF($D{r}="","",IFERROR((H{r}+M{r}+N{r})/(F{r}+M{r}+N{r}+{tb("犧飛", r)}),""))', f_base, None, "0.000", center)
    put(ws, r, 19, f'=IF($D{r}="","",IFERROR({tb("壘打數", r)}/F{r},""))', f_base, None, "0.000", center)
    put(ws, r, 20, f'=IF($D{r}="","",IFERROR(R{r}+S{r},""))', f_base, None, "0.000", center)
    put(ws, r, 21, f'=IF($D{r}="","",{tb("用球數", r)})', f_base, None, "0", center)
dv(ws, "守位清單", f"C{LU + 1}:C{LU + 15}")
d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"D{LU + 1}:D{LU + 15}")
for i, l in enumerate(GAME["lineup"]):
    ws.cell(row=LU + 1 + i, column=2, value=l["order"]); ws.cell(row=LU + 1 + i, column=3, value=l["pos_raw"]); ws.cell(row=LU + 1 + i, column=4, value=l["name"])
tot = LU + 16
put(ws, tot, 4, "合計", f_bold, fill_total)
for i in range(12): let = L(5 + i); put(ws, tot, 5 + i, f"=SUM({let}{LU + 1}:{let}{LU + 15})", f_bold, fill_total, "0", center)
# pitching line
PT = tot + 3
put(ws, PT - 1, 2, "投球成績（由『單場-投球』自動計算）", f_bold, fill_band); ws.merge_cells(start_row=PT - 1, start_column=2, end_row=PT - 1, end_column=18)
PT_COLS = ["勝敗", "任務", "球員", "IP", "BF", "PC", "好球", "壞球", "S%", "K", "BB", "HBP", "H", "HR", "R", "ER", "ERA", "WHIP", "CSW%", "F-Strike%"]
for i, h in enumerate(PT_COLS): hdr(ws, PT, 2 + i, h, auto=i >= 3)
def tp(col, r):
    return f'SUMIFS({PP}!${PL[col]}$2:${PL[col]}${TROWS},{PP}!${PL["投手"]}$2:${PL["投手"]}${TROWS},$D{r})'
for k in range(6):
    r = PT + 1 + k
    put(ws, r, 2, None, f_input, fill_input, None, center); put(ws, r, 3, None, f_input, fill_input, None, center); put(ws, r, 4, None, f_input, fill_input)
    put(ws, r, 5, f'=IF($D{r}="","",INT({tp("出局數", r)}/3)+MOD({tp("出局數", r)},3)/10)', f_base, None, "0.0", center)
    fs = [tp("打席", r), tp("用球數", r), tp("好球", r) + "+" + tp("界外", r), tp("壞球", r)]
    for i, f in enumerate(fs): put(ws, r, 6 + i, f'=IF($D{r}="","",{f})', f_base, None, "0", center)
    put(ws, r, 10, f'=IF($D{r}="","",IFERROR(H{r}/G{r},""))', f_base, None, "0.0%", center)
    fs = [tp("三振", r), tp("保送", r), tp("觸身", r), tp("安打", r), tp("全壘打", r), tp("失分", r), tp("自責", r)]
    for i, f in enumerate(fs): put(ws, r, 11 + i, f'=IF($D{r}="","",{f})', f_base, None, "0", center)
    put(ws, r, 18, f'=IF($D{r}="","",IFERROR(Q{r}*{PARAM["每場局數"]}/({tp("出局數", r)}/3),""))', f_base, None, "0.00", center)
    put(ws, r, 19, f'=IF($D{r}="","",IFERROR((L{r}+N{r})/({tp("出局數", r)}/3),""))', f_base, None, "0.00", center)
    put(ws, r, 20, f'=IF($D{r}="","",IFERROR(({tp("看好球", r)}+{tp("揮空", r)})/G{r},""))', f_base, None, "0.0%", center)
    put(ws, r, 21, f'=IF($D{r}="","",IFERROR({tp("首球好球", r)}/F{r},""))', f_base, None, "0.0%", center)
dv(ws, "任務", f"C{PT + 1}:C{PT + 6}")
d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"D{PT + 1}:D{PT + 6}")
for i, p in enumerate(GAME["pitchers"]):
    ws.cell(row=PT + 1 + i, column=2, value=p["decision"] or None); ws.cell(row=PT + 1 + i, column=3, value=p["role"]); ws.cell(row=PT + 1 + i, column=4, value=p["name"])
# fielding entry block (same columns as 守備紀錄 so it can be pasted)
FB = PT + 9
put(ws, FB - 1, 2, "守備紀錄（比賽後填寫；整塊複製到『守備紀錄』貼上值）", f_bold, fill_band); ws.merge_cells(start_row=FB - 1, start_column=2, end_row=FB - 1, end_column=14)
for i, h in enumerate(FLD_INPUT): hdr(ws, FB, 2 + i, h, auto=(i == 0))
for k in range(16):
    r = FB + 1 + k
    put(ws, r, 2, f'=IF(C{r}="","",{GID})', f_base, None, None, center)
    for i in range(1, len(FLD_INPUT)): put(ws, r, 2 + i, None, f_input, fill_input, None, center)
dv(ws, "守位清單", f"D{FB + 1}:D{FB + 16}")
d = DataValidation(type="list", formula1=f"={ROSTER_NAME}", allow_blank=True, showErrorMessage=False); ws.add_data_validation(d); d.add(f"C{FB + 1}:C{FB + 16}")
for i, row in enumerate(FLD_SEED):
    for k, v in row.items():
        if k == "比賽ID" or v in (None, ""): continue
        ws.cell(row=FB + 1 + i, column=1 + FLD[k], value=v)
# fix E column reference in line score (our errors) to fielding block
ws.cell(row=LS + 2, column=14, value=f"=SUM(H{FB + 1}:H{FB + 16})")
ws.freeze_panes = "A9"

def build_template_log(name, inputs, autos, formulas_fn, seed_fn, rows_data):
    ws = wb.create_sheet(name)
    cols = inputs + autos
    for i, h in enumerate(cols):
        hdr(ws, 1, i + 1, h, auto=(i >= len(inputs) or i == 0), width=log_widths.get(h, 5 if h.startswith("球") else 7))
    for rr in range(2, TROWS + 1):
        fs = formulas_fn(rr)
        for i, h in enumerate(cols):
            col = i + 1
            if h == "比賽ID":
                who = BL["打者"] if name == "單場-打擊" else PL["投手"]
                put(ws, rr, col, f"=IF({who}{rr}=\"\",\"\",'單場-摘要'!$C$2)", f_base, None, None, center)
            elif h in fs and i >= len(inputs):
                if h in ("日期", "杯賽", "對手", "主客", "勝敗", "首打席", "首人次", "先發"):
                    continue  # not meaningful in a single-game sheet
                put(ws, rr, col, fs[h], f_base, None, "0")
            elif h in fs:
                put(ws, rr, col, fs[h], f_base, None, "0")
            elif i < len(inputs):
                put(ws, rr, col, None, f_input, fill_input)
    ws.freeze_panes = "H2"
    seed_fn(ws, rows_data)
    ws.cell(row=TROWS + 2, column=1, value="貼回總表時只複製 A 欄到『備註』欄（灰色自動欄不用）。").font = f_note
    return ws
wt = build_template_log("單場-打擊", BAT_INPUT, BAT_AUTO, bat_formulas, seed_bat, GAME["batting"]); add_log_validations(wt, BAT, "bat")
wt = build_template_log("單場-投球", PIT_INPUT, PIT_AUTO, pit_formulas, seed_pit, GAME["pitching"]); add_log_validations(wt, PIT, "pit")
# template logs: replace helper formula ranges LAST → TROWS not needed (row-local formulas), but 首打席 etc. skipped above

# ============================================================================ 數據字典
ws = wb.create_sheet("數據字典")
title(ws, "數據字典", 8, "現有 = 原單場紀錄表已有；新增 = 本平台新增。優先度 P0 核心 / P1 重要 / P2 進階。")
DC = ["代碼", "中文", "英文", "類別", "公式 / 定義", "來源", "優先度", "備註"]
for i, h in enumerate(DC): hdr(ws, 3, i + 1, h, width=[12, 14, 26, 8, 60, 6, 7, 40][i])
for i, s in enumerate(STAT_DICTIONARY):
    r = 4 + i
    for j, k in enumerate(["key", "zh", "en", "group", "formula", "status", "priority", "note"]):
        put(ws, r, j + 1, s[k], f_base, fill_band if i % 2 else None, align=left)
ws.freeze_panes = "A4"; ws.auto_filter.ref = f"A3:H{3 + len(STAT_DICTIONARY)}"

# sheet order & tab colors
order = ["說明", "總表", "比賽清單", "球員名單", "打席紀錄", "投球紀錄", "守備紀錄", "單場-摘要", "單場-打擊", "單場-投球", "設定", "數據字典"]
wb._sheets = [wb[n] for n in order]
for n, colr in [("總表", "1F3A2E"), ("比賽清單", "2E5E4E"), ("球員名單", "2E5E4E"), ("打席紀錄", "6B7B75"), ("投球紀錄", "6B7B75"), ("守備紀錄", "6B7B75"),
                ("單場-摘要", "D98D1C"), ("單場-打擊", "D98D1C"), ("單場-投球", "D98D1C")]:
    wb[n].sheet_properties.tabColor = colr
wb.active = 1
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
json.dump(STAT_DICTIONARY, open(os.path.join(ROOT, "data", "stat_dictionary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
schema = {"batting_log": BAT_INPUT, "batting_auto": BAT_AUTO, "pitching_log": PIT_INPUT, "pitching_auto": PIT_AUTO, "fielding_log": FLD_INPUT,
          "games": GAME_COLS, "roster": ROSTER_COLS, "lists": LISTS, "pitch_slots": PITCH_N}
json.dump(schema, open(os.path.join(ROOT, "data", "schema.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", OUT)
