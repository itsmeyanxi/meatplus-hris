/**
 * Employee name formatting — the frontend mirror of `Employee::formatName()`
 * in the backend (app/Domain/HRIS/Models/Employee.php).
 *
 * Company-wide rule: names are shown SURNAME FIRST — "MEMPIN, Adrian Benedict"
 * — so a roster reads and sorts by surname. Anything the API already sends as
 * `full_name` is formatted this way server-side; use the helpers here only when
 * a view has the separate name parts on hand.
 */

/** "MEMPIN, Adrian Benedict" — the display order for every list, table and header. */
export function formatEmployeeName(
  first?: string | null,
  last?: string | null,
  middle?: string | null,
  suffix?: string | null,
): string {
  const given = [first, middle, suffix].filter(Boolean).join(" ").trim();
  const surname = (last ?? "").trim();

  // A missing half must not leave a stray comma behind.
  if (!surname) return given;
  return given ? `${surname}, ${given}` : surname;
}

/**
 * "Adrian Benedict Mempin" — given-name-first. Only for the places where the
 * order isn't ours to choose: bank account names, and prose addressed to a
 * person ("Hi Adrian, …").
 */
export function formatNameGivenFirst(
  first?: string | null,
  last?: string | null,
  middle?: string | null,
  suffix?: string | null,
): string {
  return [first, middle, last, suffix].filter(Boolean).join(" ").trim();
}
