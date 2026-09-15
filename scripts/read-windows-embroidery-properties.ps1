param([string]$Directory = "$PSScriptRoot/../tests/fixtures/embroidery")
$embFolderPath = (Resolve-Path -LiteralPath $Directory).Path
$embShell = New-Object -ComObject Shell.Application
$embFolder = $embShell.Namespace($embFolderPath)
$embResults = foreach ($embFile in Get-ChildItem -LiteralPath $embFolderPath -File) {
    $embItem = $embFolder.ParseName($embFile.Name)
    $embProperties = for ($embIndex = 0; $embIndex -lt 400; $embIndex++) {
        $embLabel = $embFolder.GetDetailsOf($null, $embIndex)
        if ($embLabel -match 'stitch|ponto|width|largura|height|altura|colour|color|cores|trim|corte|Wilcom') {
            [pscustomobject]@{ Index = $embIndex; Name = $embLabel; Value = $embFolder.GetDetailsOf($embItem, $embIndex) }
        }
    }
    [pscustomobject]@{ File = $embFile.Name; EmbroideryProperties = @($embProperties) }
}
$embResults | ConvertTo-Json -Depth 5
