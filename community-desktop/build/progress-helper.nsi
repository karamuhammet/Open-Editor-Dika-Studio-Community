; ccprogress.exe - the installer's progress reporter, and it is a SEPARATE PROCESS on purpose.
;
; ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
; The installer cannot report its own percentage. NSIS's progress bar is driven by two different
; things - its own File decompression, then `Nsis7z::Extract`, which resets the same control to zero
; and drives it again - so the position genuinely runs forward, drops, and runs forward again.
; Turning that into one rising number means polling, and polling from inside the installer means
; executing NSIS instructions on the UI thread while the install thread is executing the section.
; They share one set of registers, one stack and one string buffer. Measured twice: one run computed
; 22% from a position of 6618 out of 21500, which those two numbers cannot produce, and the next run
; took the whole installer down four seconds in.
;
; A second process has none of that. It has its own interpreter and its own memory, and it talks to
; the installer only through window messages, which is exactly what they are for. It reads the
; hidden bar, decides what the honest number is, and writes it into the installer's own controls.
;
; ── THE CONTRACT WITH build/installer.nsh ─────────────────────────────────────────────────────────
; One argument: the installer's top-level window handle, in decimal.
; The controls are found by CONTROL ID on the INSTFILES dialog, stamped there by installer.nsh:
;   1004  NSIS's own progress bar, hidden, the source of the figure
;   5000  the track   we draw the bar in
;   5001  the fill    this process resizes
;   5002  the percentage label
;   5003  the status label
; Change an id on one side and change it on the other; there is no shared header between two NSIS
; scripts, so this comment is the interface.
;
; Built by build/make-progress-helper.mjs. It must never show a window and must never outlive the
; installer: it exits when the page loses its progress bar, when the window closes, or after twenty
; minutes, whichever comes first.

Unicode true
Name "dika.studio setup progress"
OutFile "ccprogress.exe"
RequestExecutionLevel user
SilentInstall silent
XPStyle on
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

; WinMessages.nsh already carries these two; naming them again is an error, not a redefinition.
Var Parent
Var Dlg
Var Bar
Var Fill
Var LblPct
Var LblStat
Var Raw
Var Range
Var Phase      ; 1 while the package is being unpacked, 2 once the archive extraction has taken over
Var LastRaw
Var Pct
Var Shown
Var Ticks
Var TrackX
Var TrackY
Var TrackW
Var TrackH

Section
  ${GetParameters} $0
  ${If} $0 == ""
    Quit
  ${EndIf}
  ; one token, and NSIS hands it over with a leading space
  StrCpy $Parent $0
  ${Do}
    StrCpy $1 $Parent 1
    ${If} $1 == " "
      StrCpy $Parent $Parent "" 1
    ${Else}
      ${ExitDo}
    ${EndIf}
  ${Loop}

  StrCpy $Phase 1
  StrCpy $LastRaw 0
  StrCpy $Shown 0
  StrCpy $Ticks 0
  StrCpy $TrackW 0

  ${Do}
    IntOp $Ticks $Ticks + 1
    ${If} $Ticks > 8000       ; twenty minutes at 150 ms, a backstop and nothing else
      Quit
    ${EndIf}

    System::Call 'user32::IsWindow(p $Parent) i .s'
    Pop $2
    ${If} $2 == 0
      Quit
    ${EndIf}

    ; the INSTFILES dialog is the child dialog that owns control 1004
    StrCpy $Dlg 0
    StrCpy $3 0
    ${Do}
      System::Call 'user32::FindWindowExW(p $Parent, p $3, w "#32770", p 0) p .s'
      Pop $3
      ${If} $3 == 0
        ${ExitDo}
      ${EndIf}
      System::Call 'user32::GetDlgItem(p $3, i 1004) p .s'
      Pop $4
      ${If} $4 <> 0
        StrCpy $Dlg $3
        StrCpy $Bar $4
        ${ExitDo}
      ${EndIf}
    ${Loop}
    ${If} $Dlg == 0
      Quit                     ; the copy page is gone, so is our job
    ${EndIf}

    System::Call 'user32::GetDlgItem(p $Dlg, i 5001) p .s'
    Pop $Fill
    System::Call 'user32::GetDlgItem(p $Dlg, i 5002) p .s'
    Pop $LblPct
    System::Call 'user32::GetDlgItem(p $Dlg, i 5003) p .s'
    Pop $LblStat

    ; the track's rectangle, in the dialog's client coordinates, read once
    ${If} $TrackW == 0
      System::Call 'user32::GetDlgItem(p $Dlg, i 5000) p .s'
      Pop $5
      ${If} $5 <> 0
        System::Call '*(i 0, i 0, i 0, i 0) p .s'
        Pop $6
        System::Call 'user32::GetWindowRect(p $5, p $6)'
        System::Call 'user32::MapWindowPoints(p 0, p $Dlg, p $6, i 2)'
        System::Call '*$6(i .r1, i .r2, i .r3, i .r4)'
        System::Free $6
        StrCpy $TrackX $1
        StrCpy $TrackY $2
        IntOp $TrackW $3 - $1
        IntOp $TrackH $4 - $2
      ${EndIf}
    ${EndIf}

    SendMessage $Bar ${PBM_GETPOS} 0 0 $Raw
    SendMessage $Bar ${PBM_GETRANGE} 0 0 $Range
    ${If} $Range <= 0
      StrCpy $Range 30000
    ${EndIf}

    ; A DROP IS A HAND-OVER, NOT A MISTAKE. The first phase writes the package into a temp folder and
    ; the second extracts it into place; each drives the bar from zero. Rather than hide that, the two
    ; are given their own share of the journey, so the number only ever rises.
    IntOp $7 $Range / 5
    IntOp $8 $LastRaw - $7
    ${If} $Raw < $8
      StrCpy $Phase 2
    ${EndIf}
    StrCpy $LastRaw $Raw

    ${If} $Phase == 1
      IntOp $Pct $Raw * 40
      IntOp $Pct $Pct / $Range
    ${Else}
      IntOp $Pct $Raw * 60
      IntOp $Pct $Pct / $Range
      IntOp $Pct $Pct + 40
    ${EndIf}
    ${If} $Pct > 100
      StrCpy $Pct 100
    ${EndIf}
    ${If} $Pct < $Shown
      StrCpy $Pct $Shown
    ${EndIf}

    ${If} $Pct != $Shown
      StrCpy $Shown $Pct

      ${If} $LblPct <> 0
        SendMessage $LblPct ${WM_SETTEXT} 0 "STR:$Pct%"
      ${EndIf}
      ${If} $LblStat <> 0
        ${If} $Pct >= 97
          SendMessage $LblStat ${WM_SETTEXT} 0 "STR:Registering file types and creating shortcuts"
        ${ElseIf} $Phase == 1
          SendMessage $LblStat ${WM_SETTEXT} 0 "STR:Unpacking the package"
        ${Else}
          SendMessage $LblStat ${WM_SETTEXT} 0 "STR:Copying the editor, the models and the fonts"
        ${EndIf}
      ${EndIf}
      ${If} $Fill <> 0
      ${AndIf} $TrackW > 0
        IntOp $9 $TrackW * $Pct
        IntOp $9 $9 / 100
        ${If} $9 < 3
          StrCpy $9 3
        ${EndIf}
        System::Call 'user32::SetWindowPos(p $Fill, p 0, i $TrackX, i $TrackY, i $9, i $TrackH, i 4)'
      ${EndIf}
    ${EndIf}

    Sleep 150
  ${Loop}
SectionEnd
