import { useNavigate } from 'react-router-dom'

/** Opens one game's detail on the 比賽 page. Chart points and table rows carry the game id as `id`. */
export function useOpenGame() {
  const navigate = useNavigate()
  return (d: object) => {
    const id = (d as { id?: unknown }).id
    if (typeof id === 'string' ? id : typeof id === 'number') navigate(`/games?game=${encodeURIComponent(String(id))}`)
  }
}
