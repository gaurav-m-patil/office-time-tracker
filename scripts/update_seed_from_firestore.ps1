$apiKey = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("QUl6YVN5RGRwcUFIRlJCQWliN3dYRmczZmcySUNrWFVFZTlIV184"))
$projectId = "physio-clinic-730a1"

$u = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/GP_OFC_attendance_logs?pageSize=300&key=$apiKey"
$res = Invoke-RestMethod -Uri $u -Method Get

$logs = @()
foreach ($d in $res.documents) {
    $f = $d.fields
    $h = 0
    if ($f.hours.doubleValue -ne $null) { $h = [double]$f.hours.doubleValue }
    elseif ($f.hours.integerValue -ne $null) { $h = [double]$f.hours.integerValue }
    elseif ($f.hours.stringValue -ne $null -and $f.hours.stringValue -ne "") { $h = [double]$f.hours.stringValue }

    $inT = if ($f.inTime.stringValue) { $f.inTime.stringValue } else { "" }
    $outT = if ($f.outTime.stringValue) { $f.outTime.stringValue } else { "" }
    $uName = if ($f.username.stringValue) { $f.username.stringValue } else { "gaurav" }

    # Purge Jebelste if any
    if ($uName.ToLower() -eq "jebel" -or $uName.ToLower() -eq "jebelste") {
        continue
    }

    $logs += [PSCustomObject]@{
        logId = $f.logId.stringValue
        username = $uName
        date = $f.date.stringValue
        status = $f.status.stringValue
        inTime = $inT
        outTime = $outT
        hours = $h
    }
}

# Sort descending by date
$sortedLogs = $logs | Sort-Object -Property date -Descending
Write-Output "Total valid records from Firestore: $($sortedLogs.Count)"

$json = $sortedLogs | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText("$PSScriptRoot\..\data\seed-data.json", $json, [System.Text.Encoding]::UTF8)
Write-Output "Successfully updated data/seed-data.json with $($sortedLogs.Count) records."
