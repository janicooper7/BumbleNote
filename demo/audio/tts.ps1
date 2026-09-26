# Speaks each line of lesson.json to its own 16 kHz mono WAV (part-NN.wav).
Add-Type -AssemblyName System.Speech
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lines = Get-Content "$dir\lesson.json" -Raw | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$i = 0
foreach ($l in $lines) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  if ($l[0] -eq "tutor") { $s.SelectVoice("Microsoft Hazel Desktop"); $s.Rate = 0 } else { $s.SelectVoice("Microsoft Zira Desktop"); $s.Rate = -1 }
  $s.SetOutputToWaveFile(("{0}\part-{1:D2}.wav" -f $dir, $i), $fmt)
  $s.Speak($l[1])
  $s.Dispose()
  $i++
}
