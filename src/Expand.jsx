import { useEffect, useState } from 'react'

// A section that slides open and closed smoothly. Its content is only created the first time it opens.
export default function Expand({ open, children }) {
  const [seen, setSeen] = useState(open)
  useEffect(() => { if (open) setSeen(true) }, [open])
  return (
    <div className={`expand ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="expand-in">{seen && children}</div>
    </div>
  )
}
