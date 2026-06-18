import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./constants";
import { detectPlatform, detectPwshBin, type Platform } from "./platform";

export const DEFAULT_ICON_PATH = join(DATA_DIR, "peon-icon.png");

export type Notifier = "osascript" | "notify-send" | "powershell" | "winforms";

export interface NotifyCommand {
  bin: string;
  args: string[];
}

function defaultCommandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function escapeNotificationText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function detectNotifier(
  platform: Platform = detectPlatform(),
  commandExists: (cmd: string) => boolean = defaultCommandExists,
): Notifier | null {
  switch (platform) {
    case "mac":
      return "osascript";
    case "linux":
      return commandExists("notify-send") ? "notify-send" : null;
    case "win":
      // Fork: native Windows uses a custom WinForms popup (multi-screen,
      // icon on the left, text left-aligned, top-most, auto-dismiss after
      // 4s). Bypasses the Windows Toast system entirely — no AUMID
      // registration, no Focus Assist suppression, more visually prominent.
      return "winforms";
    case "wsl":
      return "powershell";
    default:
      return null;
  }
}

export function resolveIcon(packPath?: string): string {
  if (packPath) {
    const packIcon = join(packPath, "icon.png");
    if (existsSync(packIcon)) return packIcon;
  }
  return DEFAULT_ICON_PATH;
}

export function buildNotifyCommand(
  notifier: Notifier | string,
  title: string,
  body: string,
  iconPath?: string,
): NotifyCommand | null {
  const safeTitle = escapeNotificationText(title);
  const safeBody = escapeNotificationText(body);

  switch (notifier) {
    case "osascript": {
      const script = `display notification "${safeBody}" with title "${safeTitle}"`;
      return { bin: "osascript", args: ["-e", script] };
    }
    case "notify-send": {
      const args = [];
      if (iconPath) args.push(`--icon=${iconPath}`);
      args.push(title, body);
      return { bin: "notify-send", args };
    }
    case "winforms": {
      return buildWinFormsCommand(safeTitle, safeBody, iconPath);
    }
    case "powershell": {
      let iconXml = "";
      if (iconPath) {
        const winPath = iconPath.replace(/\//g, "\\");
        iconXml = `\n$binding = $template.GetElementsByTagName('binding')[0]\n$img = $template.CreateElement('image')\n$img.SetAttribute('placement','appLogoOverride')\n$img.SetAttribute('src','${winPath}')\n$binding.AppendChild($img) > $null`;
      }
      const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$text = $template.GetElementsByTagName('text')
$text.Item(0).AppendChild($template.CreateTextNode('${safeTitle}')) > $null
$text.Item(1).AppendChild($template.CreateTextNode('${safeBody}')) > $null${iconXml}
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('peon-ping').Show($toast)
`.trim();
      return { bin: detectPwshBin() ?? "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", ps] };
    }
    default:
      return null;
  }
}

export interface NotifyOptions {
  platform?: Platform;
  iconPath?: string;
}

export function sendDesktopNotification(
  title: string,
  body: string,
  options: NotifyOptions | Platform = {},
): boolean {
  const opts: NotifyOptions = typeof options === "string"
    ? { platform: options }
    : options;
  const platform = opts.platform ?? detectPlatform();
  const notifier = detectNotifier(platform);
  if (!notifier) return false;

  const cmd = buildNotifyCommand(notifier, title, body, opts.iconPath);
  if (!cmd) return false;

  try {
    const child = spawn(cmd.bin, cmd.args, { stdio: "ignore", detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// Fork: native Windows custom popup using WinForms.
//
// Why not Windows Toast (the upstream WSL code path)?
//   1. WinRT Toast from a `-NonInteractive -Command` background PowerShell
//      process silently fails to render (same root cause as WPF MediaPlayer).
//   2. Even when it renders, Toast requires a registered AppUserModelID
//      (AUMID) in the registry AND a Start Menu shortcut for scenario=
//      reminder to work; otherwise Windows drops the notification silently.
//   3. Toast is corner-only, small, and visually weak.
//
// WinForms Form.Show + Application.Run works reliably in a spawned
// PowerShell process. We get: arbitrary position (1/4 screen height),
// multi-monitor support, custom layout (icon left + text left-aligned),
// no AUMID/registry/Start Menu dependencies, not suppressed by Focus Assist.
function buildWinFormsCommand(
  title: string,
  body: string,
  iconPath?: string,
): NotifyCommand {
  // Paths into PowerShell single-quoted strings: escape ' as ''
  const psSingle = (s: string) => s.replace(/'/g, "''");
  const iconWinPath = iconPath ? iconPath.replace(/\//g, "\\") : "";
  const safeIconPath = psSingle(iconWinPath);

  // PowerShell template. Single-quoted strings inside; we interpolate only
  // safe values from above.
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing

$iconPath = '${safeIconPath}'
$hasIcon = ($iconPath -ne '') -and (Test-Path $iconPath)
$screens = [System.Windows.Forms.Screen]::AllScreens
$forms = New-Object System.Collections.ArrayList
$formWidth = 580
$formHeight = 180

foreach ($screen in $screens) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'peon-ping'
    $form.TopMost = $true
    $form.FormBorderStyle = 'None'
    $form.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 40)
    $form.Size = New-Object System.Drawing.Size($formWidth, $formHeight)
    $form.ShowInTaskbar = $false
    $form.StartPosition = 'Manual'

    $wa = $screen.WorkingArea
    $x = $wa.X + [int](($wa.Width - $formWidth) / 2)
    $y = $wa.Y + [int]($wa.Height / 4) - [int]($formHeight / 2)
    $form.Location = New-Object System.Drawing.Point($x, $y)

    if ($hasIcon) {
        $pictureBox = New-Object System.Windows.Forms.PictureBox
        $pictureBox.Location = New-Object System.Drawing.Point(20, 40)
        $pictureBox.Size = New-Object System.Drawing.Size(100, 100)
        $pictureBox.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
        $pictureBox.Image = [System.Drawing.Image]::FromFile($iconPath)
        $form.Controls.Add($pictureBox)
    }

    $textX = $(if ($hasIcon) { 140 } else { 20 })
    $textWidth = $(if ($hasIcon) { 420 } else { 540 })

    $label1 = New-Object System.Windows.Forms.Label
    $label1.Text = '${title.replace(/'/g, "''")}'
    $label1.Font = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
    $label1.ForeColor = [System.Drawing.Color]::White
    $label1.AutoSize = $false
    $label1.Size = New-Object System.Drawing.Size($textWidth, 60)
    $label1.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $label1.Location = New-Object System.Drawing.Point($textX, 30)

    $label2 = New-Object System.Windows.Forms.Label
    $label2.Text = '${body.replace(/'/g, "''")}'
    $label2.Font = New-Object System.Drawing.Font('Segoe UI', 14)
    $label2.ForeColor = [System.Drawing.Color]::LightGray
    $label2.AutoSize = $false
    $label2.Size = New-Object System.Drawing.Size($textWidth, 40)
    $label2.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $label2.Location = New-Object System.Drawing.Point($textX, 100)

    $form.Controls.Add($label1)
    $form.Controls.Add($label2)
    $forms.Add($form) | Out-Null
}

foreach ($f in $forms) { $f.Show() | Out-Null }

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.Add_Tick({
    foreach ($f in $forms) { $f.Close() }
    [System.Windows.Forms.Application]::Exit()
})
$timer.Start()

[System.Windows.Forms.Application]::Run()`;

  return { bin: "powershell.exe", args: ["-NoProfile", "-STA", "-Command", ps] };
}
