$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$postalResponse = Invoke-WebRequest -UseBasicParsing 'https://download.geonames.org/export/zip/IN.zip'
$postalStream = New-Object System.IO.MemoryStream(,$postalResponse.Content)
$postalZip = New-Object System.IO.Compression.ZipArchive($postalStream)
$postalRows = New-Object 'System.Collections.Generic.HashSet[string]'
$postalCulture = [System.Globalization.CultureInfo]::GetCultureInfo('en-IN').TextInfo
try {
    $postalEntry = $postalZip.GetEntry('IN.txt')
    if (!$postalEntry) { throw 'The source archive does not contain IN.txt.' }
    $postalReader = New-Object System.IO.StreamReader($postalEntry.Open())
    try {
        while (($postalLine = $postalReader.ReadLine()) -ne $null) {
            $postalOffice = $postalLine.Split("`t")
            if ($postalOffice.Length -lt 6 -or $postalOffice[1] -notmatch '^[1-9]\d{5}$' -or !$postalOffice[3] -or !$postalOffice[5]) { continue }
            $postalState = $postalCulture.ToTitleCase($postalOffice[3].Trim().ToLowerInvariant())
            $postalCity = $postalCulture.ToTitleCase($postalOffice[5].Trim().ToLowerInvariant())
            if ($postalState -eq 'Orissa') { $postalState = 'Odisha' }
            if ($postalState -eq 'Pondicherry') { $postalState = 'Puducherry' }
            if ($postalState -eq 'Jammu & Kashmir' -and $postalCity -in @('Leh', 'Kargil')) { $postalState = 'Ladakh' }
            [void]$postalRows.Add("$postalState|$postalCity|$($postalOffice[1])")
        }
    } finally { $postalReader.Dispose() }
} finally { $postalZip.Dispose(); $postalStream.Dispose() }
if ($postalRows.Count -lt 15000) { throw 'The source directory is incomplete; existing data was not changed.' }
$postalDirectory = [ordered]@{}
foreach ($postalRow in ($postalRows | Sort-Object)) {
    $postalParts = $postalRow.Split('|')
    if (!$postalDirectory.Contains($postalParts[0])) { $postalDirectory[$postalParts[0]] = [ordered]@{} }
    if (!$postalDirectory[$postalParts[0]].Contains($postalParts[1])) { $postalDirectory[$postalParts[0]][$postalParts[1]] = New-Object 'System.Collections.Generic.List[string]' }
    $postalDirectory[$postalParts[0]][$postalParts[1]].Add($postalParts[2])
}
$postalJson = $postalDirectory | ConvertTo-Json -Depth 5 -Compress
$postalTarget = Join-Path $PSScriptRoot '../src/features/partner_program/postal-directory.data.ts'
$postalOutput = "// Source: GeoNames postal export https://download.geonames.org/export/zip/IN.zip`n// CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ (postal district used as city).`n// Snapshot refreshed $([DateTime]::UtcNow.ToString('yyyy-MM-dd')); refresh with scripts/update_postal_directory.ps1.`nexport const postal_directory: Record<string, Record<string, string[]>> = $postalJson;`n"
[System.IO.File]::WriteAllText($postalTarget, $postalOutput, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Saved $($postalRows.Count) state/district/PIN combinations across $($postalDirectory.Count) states/territories."
