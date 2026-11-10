$apiKey = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("QUl6YVN5RGRwcUFIRlJCQWliN3dYRmczZmcySUNrWFVFZTlIV184"))
$projectId = "physio-clinic-730a1"
$commitUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:commit?key=$apiKey"

$seedFile = "data/seed-data.json"
if (-not (Test-Path $seedFile)) {
    Write-Error "Seed file not found: $seedFile"
    exit 1
}

$logs = Get-Content $seedFile -Raw | ConvertFrom-Json
Write-Output "Loaded $($logs.Count) logs from $seedFile"

# 1. Prepare Writes in Batches of 50
$batchSize = 50
$totalMigrated = 0

for ($i = 0; $i -lt $logs.Count; $i += $batchSize) {
    $chunk = $logs | Select-Object -Skip $i -First $batchSize
    $writes = @()

    foreach ($l in $chunk) {
        $docPath = "projects/$projectId/databases/(default)/documents/office_attendance_logs/$($l.logId)"
        
        $hoursVal = 0.0
        if ($l.hours -ne $null -and $l.hours -ne "") {
            $hoursVal = [double]$l.hours
        }

        $fields = @{
            logId = @{ stringValue = "$($l.logId)" }
            username = @{ stringValue = "$($l.username)" }
            date = @{ stringValue = "$($l.date)" }
            status = @{ stringValue = "$($l.status)" }
            inTime = @{ stringValue = if ($l.inTime) { "$($l.inTime)" } else { "" } }
            outTime = @{ stringValue = if ($l.outTime) { "$($l.outTime)" } else { "" } }
            hours = @{ doubleValue = $hoursVal }
            migratedAt = @{ stringValue = (Get-Date).ToUniversalTime().ToString("o") }
        }

        $writes += @{
            update = @{
                name = $docPath
                fields = $fields
            }
        }
    }

    $payload = @{ writes = $writes } | ConvertTo-Json -Depth 10

    try {
        $res = Invoke-RestMethod -Uri $commitUrl -Method Post -Body $payload -ContentType "application/json"
        $totalMigrated += $chunk.Count
        Write-Output "Batch committed: $totalMigrated / $($logs.Count) records migrated..."
    } catch {
        Write-Error "Failed to commit batch: $_"
        $streamReader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Output $streamReader.ReadToEnd()
        exit 1
    }
}

# 2. Migrate Users
$rawBackup = Get-Content "data/backup_office_tracker_raw.json" -Raw | ConvertFrom-Json
$userWrites = @()
foreach ($u in $rawBackup.users) {
    $userPath = "projects/$projectId/databases/(default)/documents/office_users/$($u.username)"
    $userWrites += @{
        update = @{
            name = $userPath
            fields = @{
                username = @{ stringValue = "$($u.username)" }
                firstName = @{ stringValue = "$($u.firstName)" }
                lastName = @{ stringValue = "$($u.lastName)" }
                role = @{ stringValue = if ($u.username -eq "gaurav") { "Admin" } else { "User" } }
            }
        }
    }
}
$userPayload = @{ writes = $userWrites } | ConvertTo-Json -Depth 10
$userRes = Invoke-RestMethod -Uri $commitUrl -Method Post -Body $userPayload -ContentType "application/json"
Write-Output "Users committed to office_users collection: $($rawBackup.users.Count) users."

Write-Output "=== MIGRATION COMPLETE: $totalMigrated RECORDS SAFELY STORED IN FIREBASE FIRESTORE ==="
