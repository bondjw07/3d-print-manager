export function canonicalFileName(value: string) {
  const baseName = value.replaceAll("\\", "/").split("/").pop() ?? value;
  return baseName.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function expectedPrintReadyName(processedDownloadName: string) {
  if (!/\.3mf$/i.test(processedDownloadName)) throw new Error("Processed artifact does not have a .3mf filename.");
  return processedDownloadName.replace(/\.3mf$/i, ".gcode.3mf");
}

export function canonicalExpectedPrintReadyName(processedDownloadName: string) {
  return canonicalFileName(expectedPrintReadyName(processedDownloadName));
}
