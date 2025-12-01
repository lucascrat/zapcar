$file = "components\AdminDashboard.tsx"
$content = Get-Content $file -Raw

# Replace the problematic ending
$oldPattern = ' \{/\* Plans Manager Overlay \*/ \}[\r\n\s]+\{[\r\n\s]+showPlansManager && \([\r\n\s]+<PlansManager onClose=\{\(\) => setShowPlansManager\(false\)\} />[\r\n\s]+\)[\r\n\s]+\}[\r\n\s]+\);'
$newPattern = '        {/* Plans Manager Overlay */}
        {showPlansManager && (
            <PlansManager onClose={() => setShowPlansManager(false)} />
        )}
    );'

$content = $content -replace $oldPattern, $newPattern

# Save the file
$content | Set-Content $file -NoNewline

Write-Host "File corrected successfully!"
