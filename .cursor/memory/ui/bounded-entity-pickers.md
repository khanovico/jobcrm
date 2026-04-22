# Bounded entity pickers

## Lesson
- Do not load entire large reference tables (for example all companies) into modal `<select>` controls.
- Prefer bounded search-driven pickers with a small server-side `limit` and preserve only the currently selected option locally.

## Why
- Full-catalog selects scale poorly twice: repeated paged API reads and large DOM trees with hundreds or thousands of `<option>` nodes.
- Search-driven pickers keep network, memory, and render cost proportional to the user’s immediate task.

## Reuse when
- A form needs one related entity from a table that can grow beyond a few dozen rows.
- Existing UI only needs `id` + display label, not the full object payload.
