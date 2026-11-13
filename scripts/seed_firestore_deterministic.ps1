$apiKey = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("QUl6YVN5RGRwcUFIRlJCQWliN3dYRmczZmcySUNrWFVFZTlIV184"))
$projectId = "physio-clinic-730a1"
$commitUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:commit?key=$apiKey"

$seedFile = "data/seed-data.json"
$logs = Get-Content $seedFile -Raw | ConvertFrom-Json
Write-Output "Loaded $($logs.Count) logs from $seedFile"

# Add Nov 13 (today) based on today's active shift
$todayLog = [PSCustomObject]@{
    logId = "gaurav_2026-11-13"
    username = "gaurav"
    date = "2026-11-13"
    status = "Present"
    inTime = "06:34 AM"
    outTime = ""
    hours = 0
}

# Update all logs to have deterministic logId = "gaurav_" + date
$deterministicLogs = @()
foreach ($l in $logs) {
    $detId = "gaurav_$($l.date)"
    $deterministicLogs += [PSCustomObject]@{
        logId = $detId
        username = "gaurav"
        date = $l.date
        status = $l.status
        inTime = if ($l.inTime) { $l.inTime } else { "" }
        outTime = if ($l.outTime) { $l.outTime } else { "" }
        hours = if ($l.hours) { [double]$l.hours } else { 0.0 }
    }
}

# Check if Nov 13 already in list
if (-not ($deterministicLogs | Where-Object { $_.date -eq "2026-11-13" })) {
    $deterministicLogs += $todayLog
}

# Sort descending
$deterministicLogs = $deterministicLogs | Sort-Object date -Descending
Write-Output "Total deterministic records to upload: $($deterministicLogs.Count)"

# Upload in batches of 50
$batchSize = 50
$totalMigrated = 0

for ($i = 0; $i -lt $deterministicLogs.Count; $i += $batchSize) {
    $chunk = $deterministicLogs | Select-Object -Skip $i -First $batchSize
    $writes = @()

    foreach ($l in $chunk) {
        $docPath = "projects/$projectId/databases/(default)/documents/GP_OFC_attendance_v2/$($l.logId)"
        
        $fields = @{
            logId = @{ stringValue = "$($l.logId)" }
            username = @{ stringValue = "$($l.username)" }
            date = @{ stringValue = "$($l.date)" }
            status = @{ stringValue = "$($l.status)" }
            inTime = @{ stringValue = "$($l.inTime)" }
            outTime = @{ stringValue = "$($l.outTime)" }
            hours = @{ doubleValue = [double]$l.hours }
            updatedAt = @{ stringValue = (Get-Date).ToUniversalTime().ToString("o") }
        }

        $writes += @{
            update = @{
                name = $docPath
                fields = $fields
            }
        }
    }

    $payload = @{ writes = $writes } | ConvertTo-Json -Depth 10
    $res = Invoke-RestMethod -Uri $commitUrl -Method Post -Body $payload -ContentType "application/json"
    $totalMigrated += $chunk.Count
    Write-Output "Committed batch: $totalMigrated / $($deterministicLogs.Count)..."
}

# Also update data/seed-data.json with deterministic logIds
$json = $deterministicLogs | ConvertTo-Json -Depth 5
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText("$PSScriptRoot\..\data\seed-data.json", $json, $utf8NoBom)
Write-Output "Successfully updated data/seed-data.json with $($deterministicLogs.Count) clean deterministic records."
