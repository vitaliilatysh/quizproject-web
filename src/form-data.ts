/** Text inputs must not turn a file upload into a string in an API payload. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
