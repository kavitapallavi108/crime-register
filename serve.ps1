# Tiny static file server for local preview (no Node/Python needed).
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 5173]
param([int]$Port = 5173)

$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.pdf' = 'application/pdf'; '.mp4' = 'video/mp4'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.Headers.Add('Accept-Ranges', 'bytes')
      $bytes = [IO.File]::ReadAllBytes($file)
      $range = $ctx.Request.Headers['Range']
      if ($range -match '^bytes=(\d*)-(\d*)$') {
        # partial content so videos can seek
        $len = $bytes.Length
        $start = if ($matches[1]) { [long]$matches[1] } else { $len - [long]$matches[2] }
        $end = if ($matches[1] -and $matches[2]) { [long]$matches[2] } else { $len - 1 }
        $end = [Math]::Min($end, $len - 1)
        $res.StatusCode = 206
        $res.Headers.Add('Content-Range', "bytes $start-$end/$len")
        $part = New-Object byte[] ($end - $start + 1)
        [Array]::Copy($bytes, $start, $part, 0, $part.Length)
        $bytes = $part
      }
    }
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch { $res.StatusCode = 500 }
  finally { $res.Close() }
}
