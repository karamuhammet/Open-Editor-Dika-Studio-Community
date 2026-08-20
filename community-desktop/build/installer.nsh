; dika.studio setup - three pages, drawn by us, out of real Windows controls.
;
; ── WHAT IS OURS AND WHAT IS WINDOWS' ─────────────────────────────────────────────────────────────
; Everything inside the frame is ours: the surface, the type, the buttons, the progress bar and the
; sign-up rail down the right. The frame itself is still a real window, because a borderless one
; cannot be dragged without subclassing a window proc, which NSIS has no way to do; instead the title
; bar is COLOURED (DwmSetWindowAttribute, Windows 11) so it belongs to the same design, and the
; minimise and maximise buttons are removed, because an installer is neither.
;
; The window is also RESIZED. NSIS's default is 497x361 client pixels, which is a 1990s wizard; this
; asks for 760x480 at 96 dpi and scales that with the display, which is what makes room for the rail.
;
; ── THE PROGRESS BAR IS NSIS'S OWN, RESTYLED ──────────────────────────────────────────────────────
; It really does step backwards once, and the long comment above ccInstallShow explains why (two
; things drive one control), why a rising percentage cannot be recovered from it without crashing the
; installer, and why a marquee is not available either. Do not spend an afternoon rediscovering that.
;
; ── THE FIVE THINGS THAT WILL BREAK THIS IF THEY ARE FORGOTTEN ────────────────────────────────────
; 1. COORDINATES ARE SCALED, NOT ABSOLUTE. Everything is written against a 760x480 client area and
;    multiplied by the real one at runtime (CC_SX / CC_SY). NSIS sizes its window in dialog units,
;    which grow with the system font, so on a 125% display the client area is not 760 wide.
; 2. A CONTROL'S BACKGROUND IS ALWAYS STATED. Nothing is `transparent`: a transparent STATIC shows
;    what its PARENT painted, and the backdrop here is a sibling control, so transparency would show
;    the dialog's grey. Text on the rail carries the rail's colour, text on the page carries the
;    page's.
; 3. CLICKABLE CONTROLS MUST BE CREATED BY nsDialogs. `${NSD_OnClick}` looks the control up in the
;    plugin's own table; a control made with CreateWindowEx is invisible to it and the click is lost
;    in silence. That is why CC_CTL has two creation paths and the progress page carries no buttons.
; 4. NUMBERS PASSED TO System::Call ARE WRITTEN IN DECIMAL. Native NSIS instructions (SetCtlColors,
;    SendMessage, IntOp) take 0x hex happily; a plugin argument is parsed by the plugin, and a style
;    that silently comes out as 0 gives an invisible control and no error anywhere.
; 5. `MUI_PAGE_CUSTOMFUNCTION_SHOW` IS DEFINED LATE, ON PURPOSE. See the note above ccInstallShow.
;
; ── WHY NSIS AT ALL, RATHER THAN OUR OWN EXECUTABLE ────────────────────────────────────────────────
; The visible half is the half worth owning. The invisible half is the file copy, the elevation
; prompt, the uninstall entry Windows reads in Settings > Apps, the file associations and the upgrade
; path. NSIS does all of that correctly, and every one of them is silent when it works and
; catastrophic when it does not. This keeps that engine and replaces every pixel in front of it.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; DECLARED ONLY IN THE INSTALLER PASS. This file is compiled twice, once with BUILD_UNINSTALLER
; defined, and the template only inserts the page macros in the first. In the second these would be
; variables nothing references, which makensis reports as `warning 6001` and electron-builder runs it
; with warnings as errors.
!ifndef BUILD_UNINSTALLER
  Var CCDlg        ; the inner dialog every control is parented to
  Var CCNsd        ; 1 when that dialog belongs to nsDialogs, 0 on the progress page
  Var CCW          ; real client width  in pixels
  Var CCH          ; real client height in pixels
  Var CCSized      ; 1 once the window has been resized and centred, so it is done exactly once
  Var CCMark       ; HBITMAP of the dika mark, loaded once
  Var CCfH1
  Var CCfBig
  Var CCfBody
  Var CCfBodyB
  Var CCfSmall
  Var CCfBrand
  Var CCfBtn
  Var CCfTag
  Var CCNativePB   ; NSIS's own progress bar, restyled and moved rather than replaced
  Var CCDpi        ; pixels per inch, so a font size in px means the same thing on every display
  Var CCHand       ; IDC_HAND, set on the buttons by the hover poll
  Var CCbA         ; the two buttons on a page, and their rects, for the hover poll
  Var CCbAx
  Var CCbAy
  Var CCbAw
  Var CCbAh
  Var CCbAs
  Var CCbB
  Var CCbBx
  Var CCbBy
  Var CCbBw
  Var CCbBh
  Var CCbBs

  ; THE OTHER HALF OF THE HIDDEN BUTTONS. Hiding Next hides it on every page, so when the copy
  ; finishes the INSTFILES page has to advance itself. MUI sets this from its own finish page's GUI
  ; init and ours is a custom page, so it has to be set here. It belongs in .onGUIInit, which is where
  ; MUI puts it: set from inside the section it is read too late to have any effect, measured, the
  ; installer sat on a completed copy for as long as it was left there.
  !define MUI_CUSTOMFUNCTION_GUIINIT ccGuiInit
  Function ccGuiInit
    SetAutoClose true
  FunctionEnd
!endif

; ── palette ───────────────────────────────────────────────────────────────────────────────────────
; The app's own tokens. CC_BG must match `BG` in build/make-wizard-art.mjs, which draws the mark on
; it: a 24 bit BMP has no alpha, so a mismatch paints a rectangle around the logo.
!define CC_BG       0x16161B
!define CC_CARD     0x1E1E26
!define CC_LINE     0x2A2A33
!define CC_LINE2    0x33333E
!define CC_INK      0xF5F5F7
!define CC_INK2     0xD6D6DE
!define CC_MUTED    0x9494A2
!define CC_FAINT    0x6E6E7B
!define CC_VOLT     0xF2FF58
!define CC_VOLTDIM  0x5E6630
!define CC_VOLTINK  0x16161B
!define CC_BTN2     0x23232C
!define CC_BTN2H    0x2E2E3A
!define CC_BTN2INK  0xC9C9D4
!define CC_VOLTH    0xF8FF8C

; The same three colours again as COLORREF (0x00BBGGRR) decimals, for the Windows frame.
!define CC_DWM_CAPTION 1775126   ; 0x1B1616 = #16161B
!define CC_DWM_TEXT   16250357   ; 0xF7F5F5 = #F5F5F7
!define CC_DWM_BORDER  3353130   ; 0x332A2A = #2A2A33

; ── the design grid ───────────────────────────────────────────────────────────────────────────────
!define CC_BASEW 760
!define CC_BASEH 480
!define CC_PAD   44
!define CC_COLW  408   ; the content column, 44 .. 452
!define CC_RAILX 496   ; the sign-up rail starts here and runs to the right edge

; ── window styles, decimal (see note 4 above) ─────────────────────────────────────────────────────
!define CC_S_TEXT   1342177280  ; 0x50000000  WS_CHILD|WS_VISIBLE, SS_LEFT, wraps
!define CC_S_LINE1  1342177792  ; + SS_CENTERIMAGE   one line, vertically centred in its box
!define CC_S_PANEL  1342177280  ; a filled rectangle
!define CC_S_BTN    1342178049  ; + SS_CENTER|SS_CENTERIMAGE|SS_NOTIFY
!define CC_S_BMP    1342177806  ; + SS_BITMAP|SS_CENTERIMAGE
!define CC_SWP_MOVE   4         ; SWP_NOZORDER
!define CC_SWP_FRAME 36         ; SWP_NOZORDER|SWP_FRAMECHANGED
!define CC_SWP_FILL  20         ; SWP_NOZORDER|SWP_NOACTIVATE
!define CC_SWP_TOP   32         ; SWP_FRAMECHANGED, and raise to the top of the z-order
!define CC_STM_SETIMAGE  0x0172

; ── scaling ───────────────────────────────────────────────────────────────────────────────────────
; X and Y scale independently: NSIS derives the dialog's width from the average character width of the
; system font and its height from the character height, and those two do not move by the same factor
; when the display scaling changes.
!macro CC_SX OUT VAL
  IntOp ${OUT} ${VAL} * $CCW
  IntOp ${OUT} ${OUT} / ${CC_BASEW}
!macroend
!macro CC_SY OUT VAL
  IntOp ${OUT} ${VAL} * $CCH
  IntOp ${OUT} ${OUT} / ${CC_BASEH}
!macroend

; ── one control ───────────────────────────────────────────────────────────────────────────────────
; Created at a dummy size and then moved, because nsDialogs takes DIALOG UNITS and this layout is in
; pixels. Moving it afterwards leaves the plugin's record of the control intact, so ${NSD_OnClick}
; still finds it. The hwnd is left in $R0 and the scaled rect in $R1..$R4 for the macros that follow.
!macro CC_CTL STYLE X Y W H TEXT FG BG FONT
  !insertmacro CC_SX $R1 ${X}
  !insertmacro CC_SY $R2 ${Y}
  !insertmacro CC_SX $R3 ${W}
  !insertmacro CC_SY $R4 ${H}
  ${If} $CCNsd == 1
    nsDialogs::CreateControl /NOUNLOAD "STATIC" "${STYLE}" "0" "0" "0" "8" "8" "${TEXT}"
    Pop $R0
  ${Else}
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i ${STYLE}, i 0, i 0, i 8, i 8, p $CCDlg, i 0, p 0, p 0) p .s'
    Pop $R0
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $R0, p 0, i $R1, i $R2, i $R3, i $R4, i ${CC_SWP_MOVE})'
  SendMessage $R0 ${WM_SETFONT} ${FONT} 1
  SetCtlColors $R0 ${FG} ${BG}
!macroend

; Rounds the control CC_CTL just made. The corners it cuts away show the DIALOG's background, which is
; why CC_BEGIN colours that as well as laying down a backdrop control.
!macro CC_ROUND R
  IntOp $R5 $R3 + 1
  IntOp $R6 $R4 + 1
  !insertmacro CC_SX $R7 ${R}
  IntOp $R7 $R7 * 2
  System::Call 'gdi32::CreateRoundRectRgn(i 0, i 0, i $R5, i $R6, i $R7, i $R7) p .s'
  Pop $R8
  System::Call 'user32::SetWindowRgn(p $R0, p $R8, i 1)'
!macroend

; SLOT is A or B, the two buttons a page can have. The rectangle is kept because ccHover has to know
; where the buttons are without asking Windows on every tick.
; Stamps a control id on whatever CC_CTL just made, so the helper process can find it by number.
!macro CC_ID N
  System::Call 'user32::SetWindowLongW(p $R0, i -12, i ${N})'
!macroend

!macro CC_BUTTON SLOT X Y W H TEXT FG BG ONCLICK
  !insertmacro CC_SX $R1 ${X}
  !insertmacro CC_SY $R2 ${Y}
  !insertmacro CC_SX $R3 ${W}
  !insertmacro CC_SY $R4 ${H}
  nsDialogs::CreateControl /NOUNLOAD "STATIC" "${CC_S_BTN}" "0" "0" "0" "8" "8" "${TEXT}"
  Pop $R0
  System::Call 'user32::SetWindowPos(p $R0, p 0, i $R1, i $R2, i $R3, i $R4, i ${CC_SWP_MOVE})'
  SendMessage $R0 ${WM_SETFONT} $CCfBtn 1
  SetCtlColors $R0 ${FG} ${BG}
  !insertmacro CC_ROUND 10
  ${NSD_OnClick} $R0 ${ONCLICK}
  StrCpy $CCb${SLOT} $R0
  StrCpy $CCb${SLOT}x $R1
  StrCpy $CCb${SLOT}y $R2
  StrCpy $CCb${SLOT}w $R3
  StrCpy $CCb${SLOT}h $R4
  StrCpy $CCb${SLOT}s 0
!macroend

; 1 when the pointer is inside the rectangle, 0 when it is not.
!macro CC_HOTSTATE OUT BX BY BW BH
  StrCpy ${OUT} 0
  IntOp $R6 ${BX} + ${BW}
  IntOp $R5 ${BY} + ${BH}
  ${If} $1 >= ${BX}
  ${AndIf} $1 < $R6
  ${AndIf} $2 >= ${BY}
  ${AndIf} $2 < $R5
    StrCpy ${OUT} 1
  ${EndIf}
!macroend

; ── native chrome ─────────────────────────────────────────────────────────────────────────────────
!macro CC_HIDE ID
  GetDlgItem $R9 $HWNDPARENT ${ID}
  ${If} $R9 <> 0
    ShowWindow $R9 ${SW_HIDE}
  ${EndIf}
!macroend

!macro CC_STRIP_NATIVE
  ; header title, header subtitle, header bitmap, the two dividers, the branding line
  !insertmacro CC_HIDE 1037
  !insertmacro CC_HIDE 1038
  !insertmacro CC_HIDE 1039
  !insertmacro CC_HIDE 1034
  !insertmacro CC_HIDE 1035
  !insertmacro CC_HIDE 1028
  !insertmacro CC_HIDE 1256
  ; Back / Next / Cancel
  !insertmacro CC_HIDE 3
  !insertmacro CC_HIDE 1
  !insertmacro CC_HIDE 2
!macroend

; ── the window itself ─────────────────────────────────────────────────────────────────────────────
; Done ONCE. Repeating it on every page would drag the window back under the pointer every time
; somebody moved it, which is the sort of small rudeness that makes software feel cheap.
;
; ⚠ `.r3` INSIDE A System::Call STRUCT READ MEANS `$3`, NOT `$R3`. The System plugin numbers the
; registers 0-9 for $0-$9 and 10-19 for $R0-$R9, so every `.r3` here writes a NUMBERED variable while
; the arithmetic underneath used to read the R one. Measured, and it is the reason the owner could not
; see the window at all: both rectangles came back as whatever those variables happened to hold, the
; work area read as 0x0, and the centring put a 760x480 window at -380,-240, i.e. three quarters of it
; off the top left of the desktop. Nothing errors, nothing logs, the window is simply somewhere else.
!macro CC_SIZE_WINDOW
  ${If} $CCSized != 1
    StrCpy $CCSized 1

    ; The display's dpi, so 760x480 means the same physical size on every screen.
    System::Call 'user32::GetDC(p 0) p .s'
    Pop $R9
    System::Call 'gdi32::GetDeviceCaps(p $R9, i 88) i .s'
    Pop $R8
    System::Call 'user32::ReleaseDC(p 0, p $R9)'
    ${If} $R8 < 72
      StrCpy $R8 96
    ${EndIf}
    IntOp $R1 ${CC_BASEW} * $R8
    IntOp $R1 $R1 / 96
    IntOp $R2 ${CC_BASEH} * $R8
    IntOp $R2 $R2 / 96

    ; An installer is neither minimised nor maximised.
    System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i .s'
    Pop $R9
    IntOp $R9 $R9 & 0xFFFCFFFF
    System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i $R9)'

    ; window rect -> $1 $2 $3 $4, client size -> $5 $6
    System::Call '*(i 0, i 0, i 0, i 0) p .s'
    Pop $R9
    System::Call 'user32::GetWindowRect(p $HWNDPARENT, p $R9)'
    System::Call '*$R9(i .r1, i .r2, i .r3, i .r4)'
    System::Free $R9
    System::Call '*(i 0, i 0, i 0, i 0) p .s'
    Pop $R9
    System::Call 'user32::GetClientRect(p $HWNDPARENT, p $R9)'
    System::Call '*$R9(i, i, i .r5, i .r6)'
    System::Free $R9

    ; window rect minus client rect = the frame, which has to be added back on so that 760x480 is the
    ; CLIENT area, which is what the layout is drawn against.
    ${If} $5 > 0
      IntOp $R5 $3 - $1
      IntOp $R5 $R5 - $5
      IntOp $R1 $R1 + $R5
      IntOp $R6 $4 - $2
      IntOp $R6 $R6 - $6
      IntOp $R2 $R2 + $R6
    ${EndIf}

    ; KEEP THE CENTRE NSIS ALREADY CHOSE, rather than centring on the primary work area: NSIS put the
    ; window on the monitor the person is looking at, and re-centring would move a two-screen setup's
    ; installer to the other screen.
    IntOp $R3 $1 + $3
    IntOp $R3 $R3 / 2
    IntOp $R9 $R1 / 2
    IntOp $R3 $R3 - $R9
    IntOp $R4 $2 + $4
    IntOp $R4 $R4 / 2
    IntOp $R9 $R2 / 2
    IntOp $R4 $R4 - $R9

    ; and stay on the desktop, because the new size may no longer fit where the old one sat.
    System::Call '*(i 0, i 0, i 0, i 0) p .s'
    Pop $R9
    System::Call 'user32::SystemParametersInfoW(i 48, i 0, p $R9, i 0)'
    System::Call '*$R9(i .r1, i .r2, i .r3, i .r4)'
    System::Free $R9
    ${If} $3 > 0
      IntOp $R5 $3 - $R1
      ${If} $R3 > $R5
        StrCpy $R3 $R5
      ${EndIf}
      IntOp $R6 $4 - $R2
      ${If} $R4 > $R6
        StrCpy $R4 $R6
      ${EndIf}
      ${If} $R3 < $1
        StrCpy $R3 $1
      ${EndIf}
      ${If} $R4 < $2
        StrCpy $R4 $2
      ${EndIf}
    ${EndIf}

    System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i $R3, i $R4, i $R1, i $R2, i ${CC_SWP_FRAME})'
  ${EndIf}

  ; Windows 11 lets a window state its own caption, text and border colour. On Windows 10 the first
  ; call still gives a dark title bar and the other three return an error and change nothing, which is
  ; the right outcome: a wrong colour would be worse than the system one.
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i ${CC_DWM_CAPTION}, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 36, *i ${CC_DWM_TEXT}, i 4)'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i ${CC_DWM_BORDER}, i 4)'
!macroend

; ── page prologue ─────────────────────────────────────────────────────────────────────────────────
!macro CC_BEGIN NSD
  StrCpy $CCNsd "${NSD}"
  !insertmacro CC_SIZE_WINDOW
  !insertmacro CC_STRIP_NATIVE

  System::Call '*(i 0, i 0, i 0, i 0) p .s'
  Pop $R9
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p $R9)'
  System::Call '*$R9(i, i, i .r1, i .r2)'
  System::Free $R9
  StrCpy $CCW $1
  StrCpy $CCH $2
  ${If} $CCW < 200
    StrCpy $CCW ${CC_BASEW}
    StrCpy $CCH ${CC_BASEH}
  ${EndIf}

  ; MUI sizes the inner dialog to sit between a header and a button bar that no longer exist.
  System::Call 'user32::SetWindowPos(p $CCDlg, p 0, i 0, i 0, i $CCW, i $CCH, i ${CC_SWP_FILL})'
  SetCtlColors $CCDlg ${CC_INK} ${CC_BG}
  ; Backdrop first, so every control after it lands above it in the z-order.
  !insertmacro CC_CTL ${CC_S_PANEL} 0 0 ${CC_BASEW} ${CC_BASEH} "" ${CC_INK} ${CC_BG} $CCfBody
!macroend

; The brand row and the step rail. The three colours are the only thing that differs between pages.
!macro CC_HEADER C1 C2 C3
  !insertmacro CC_CTL ${CC_S_BMP} 44 40 44 25 "" ${CC_INK} ${CC_BG} $CCfBody
  SendMessage $R0 ${CC_STM_SETIMAGE} 0 $CCMark
  !insertmacro CC_CTL ${CC_S_LINE1} 100 38 120 29 "dika.studio" ${CC_INK} ${CC_BG} $CCfBrand
  !insertmacro CC_CTL ${CC_S_LINE1} 222 41 70 24 "${VERSION}" ${CC_FAINT} ${CC_BG} $CCfSmall
  !insertmacro CC_CTL ${CC_S_PANEL} 346 51 30 3 "" ${CC_BG} ${C1} $CCfBody
  !insertmacro CC_CTL ${CC_S_PANEL} 384 51 30 3 "" ${CC_BG} ${C2} $CCfBody
  !insertmacro CC_CTL ${CC_S_PANEL} 422 51 30 3 "" ${CC_BG} ${C3} $CCfBody
  !insertmacro CC_CTL ${CC_S_PANEL} 44 92 ${CC_COLW} 1 "" ${CC_BG} ${CC_LINE} $CCfBody
!macroend

; The sign-up rail. It is the whole right edge of every page, which is what the extra width bought:
; the offer sits beside the install instead of interrupting it, and it is the same panel throughout so
; nobody has to read it twice.
!macro CC_RAIL
  !insertmacro CC_CTL ${CC_S_PANEL} ${CC_RAILX} 0 264 ${CC_BASEH} "" ${CC_INK} ${CC_CARD} $CCfBody
  !insertmacro CC_CTL ${CC_S_LINE1} 528 64 200 18 "FREE ACCOUNT" ${CC_VOLT} ${CC_CARD} $CCfTag
  !insertmacro CC_CTL ${CC_S_TEXT} 528 90 200 76 "Templates, cloud sync and the asset library" ${CC_INK} ${CC_CARD} $CCfBodyB
  !insertmacro CC_CTL ${CC_S_TEXT} 528 178 200 120 "Works fully offline and always will. An account adds the online template library and release news." ${CC_MUTED} ${CC_CARD} $CCfBody
  !insertmacro CC_CTL ${CC_S_PANEL} 528 310 200 1 "" ${CC_CARD} ${CC_LINE2} $CCfBody
  !insertmacro CC_CTL ${CC_S_LINE1} 528 324 200 26 "dika.studio" ${CC_VOLT} ${CC_CARD} $CCfBtn
  !insertmacro CC_CTL ${CC_S_TEXT} 528 358 200 40 "Free. No card, and no account needed to install." ${CC_FAINT} ${CC_CARD} $CCfSmall
!macroend

; A feature line: a small volt square and a sentence.
!macro CC_FEATURE Y TEXT
  IntOp $R9 ${Y} + 7
  !insertmacro CC_CTL ${CC_S_PANEL} 44 $R9 8 8 "" ${CC_BG} ${CC_VOLT} $CCfBody
  !insertmacro CC_ROUND 4
  !insertmacro CC_CTL ${CC_S_LINE1} 66 ${Y} 386 22 "${TEXT}" ${CC_INK2} ${CC_BG} $CCfBody
!macroend

; ── one-time setup ────────────────────────────────────────────────────────────────────────────────
; Font sizes are POINTS and NSIS converts them with the screen dpi, so they follow the display scaling
; on their own. $HWNDPARENT does not exist yet inside .onInit, which is why the window and its frame
; are set up on the first page instead of here.
; A font in PIXELS, at CLEARTYPE quality, scaled by the display's dpi.
;
; NSIS's own `CreateFont` instruction takes points and leaves the quality at DEFAULT, which is how
; the first build ended up with text that reads as slightly wrong without being obviously broken.
; CLEARTYPE_QUALITY (12) is stated here rather than hoped for, and a negative height asks for a CELL
; height in pixels, which is the only way to line type up with a layout that is also in pixels.
!macro CC_FONT VAR PX WEIGHT
  IntOp $R1 ${PX} * $CCDpi
  IntOp $R1 $R1 / 96
  IntOp $R1 0 - $R1
  System::Call 'gdi32::CreateFontW(i $R1, i 0, i 0, i 0, i ${WEIGHT}, i 0, i 0, i 0, i 1, i 0, i 0, i 12, i 0, w "Segoe UI") p .s'
  Pop ${VAR}
!macroend

; ── ONE FOLDER, ALWAYS ────────────────────────────────────────────────────────────────────────────
; `customInit` runs inside `.onInit` AFTER `initMultiUser`, which is the only seam where $INSTDIR can
; still be corrected, and it needed correcting: multiUser prefers the `InstallLocation` an EARLIER
; build wrote, so once a build had installed as `cardcraft-community-desktop` every later one landed
; at `...\Programs\cardcraft-community-desktop\dika.studio` while the Start menu shortcut still
; pointed at `...\Programs\dika.studio`. Measured on this machine: two complete 438 MB copies, the
; older one three hours stale, and the shortcut opening THAT. Every fix shipped that day was on disk
; and none of it was being run, which reads exactly like a fix that did not work.
;
; `/D` still wins, because that is the switch a person types on purpose.
!macro customInit
  ${StdUtils.GetParameter} $R0 "D" ""
  ${If} $R0 == ""
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${APP_FILENAME}"
  ${EndIf}

  InitPluginsDir
  File "/oname=$PLUGINSDIR\wizard-mark.bmp" "${BUILD_RESOURCES_DIR}\wizard-mark.bmp"
  File "/oname=$PLUGINSDIR\ccprogress.exe" "${BUILD_RESOURCES_DIR}\ccprogress.exe"

  System::Call 'user32::GetDC(p 0) p .s'
  Pop $R9
  System::Call 'gdi32::GetDeviceCaps(p $R9, i 88) i .s'
  Pop $CCDpi
  System::Call 'user32::ReleaseDC(p 0, p $R9)'
  ${If} $CCDpi < 72
    StrCpy $CCDpi 96
  ${EndIf}

  !insertmacro CC_FONT $CCfH1    32 600
  !insertmacro CC_FONT $CCfBig   30 600
  !insertmacro CC_FONT $CCfBrand 19 600
  !insertmacro CC_FONT $CCfBodyB 17 600
  !insertmacro CC_FONT $CCfBody  14 400
  !insertmacro CC_FONT $CCfBtn   15 600
  !insertmacro CC_FONT $CCfSmall 12 400
  !insertmacro CC_FONT $CCfTag   11 700

  ; 16 = LR_LOADFROMFILE
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\wizard-mark.bmp", i 0, i 0, i 0, i 16) p .s'
  Pop $CCMark

  ; ── THE POINTER, AND THE ONE THING THAT MUST NOT BE TRADED FOR IT ───────────────────────────────
  ; These buttons are STATIC controls, because a STATIC is the only standard control whose background
  ; can be coloured: a real push button ignores WM_CTLCOLORBTN outright, so a volt one is impossible
  ; without owner-draw, and owner-draw needs a window proc NSIS cannot provide. A STATIC shows the
  ; arrow cursor, which is what made every control read as dead.
  ;
  ; ⚠ THE OBVIOUS FIX BREAKS THE BUTTON. Cloning the STATIC class under a new name with IDC_HAND does
  ; give the pointer, and it silently stops the click: nsDialogs decides what a control IS from its
  ; CLASS NAME, and a name it does not recognise gets no event dispatched at all. Measured three ways
  ; in one harness: a STATIC label delivers its click, a real BUTTON delivers its click, and the clone
  ; delivers nothing. The owner found it before this did, by pressing Install and watching it sit
  ; there. A pointer is worth nothing on a button that cannot be pressed.
  ;
  ; So the class stays STATIC and the cursor is set from the hover poll instead, which already knows
  ; when the pointer is inside a button.
  System::Call 'user32::LoadCursorW(p 0, i 32649) p .s'
  Pop $CCHand
!macroend

; ── the "who is this for" page never appears ──────────────────────────────────────────────────────
; perMachine is false, so this install is per-user either way and the choice is a page of noise in a
; style we do not control. Forcing it here makes multiUserUi's PRE take its Abort branch BEFORE it
; creates anything, which is also what keeps its dialog off the screen: that function calls
; `nsDialogs::Create` and only then decides, so a page skipped any later leaves its controls behind,
; painted over ours. Measured before this line existed.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; ── page 1: welcome ───────────────────────────────────────────────────────────────────────────────
!macro customWelcomePage
  Page custom ccWelcomeShow

  Function ccWelcomeShow
    nsDialogs::Create 1018
    Pop $CCDlg
    ${If} $CCDlg == error
      Abort
    ${EndIf}
    !insertmacro CC_BEGIN 1
    !insertmacro CC_HEADER ${CC_VOLT} ${CC_LINE} ${CC_LINE}
    !insertmacro CC_RAIL

    !insertmacro CC_CTL ${CC_S_LINE1} 44 122 ${CC_COLW} 44 "Install dika.studio" ${CC_INK} ${CC_BG} $CCfH1
    !insertmacro CC_CTL ${CC_S_TEXT} 44 176 ${CC_COLW} 46 "An offline design and video studio. Nothing you make here is uploaded anywhere." ${CC_MUTED} ${CC_BG} $CCfBody

    !insertmacro CC_FEATURE 240 "Editor, video timeline and export, all offline"
    !insertmacro CC_FEATURE 272 "Your files stay on this computer"
    !insertmacro CC_FEATURE 304 "Free to use, source available, BUSL 1.1"

    !insertmacro CC_CTL ${CC_S_PANEL} 44 356 ${CC_COLW} 1 "" ${CC_BG} ${CC_LINE} $CCfBody
    !insertmacro CC_CTL ${CC_S_TEXT} 44 398 164 44 "For your account only.$\r$\nNo admin rights needed." ${CC_FAINT} ${CC_BG} $CCfSmall

    !insertmacro CC_BUTTON A 212 392 106 44 "Cancel" ${CC_BTN2INK} ${CC_BTN2} ccGoCancel
    !insertmacro CC_BUTTON B 332 392 120 44 "Install" ${CC_VOLTINK} ${CC_VOLT} ccGoNext

    ${NSD_CreateTimer} ccHover 30
    nsDialogs::Show
    ${NSD_KillTimer} ccHover
  FunctionEnd

  ; A click on our rectangle sends exactly what the native button would have sent.
  Function ccGoNext
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  FunctionEnd

  Function ccGoCancel
    SendMessage $HWNDPARENT ${WM_COMMAND} 2 0
  FunctionEnd
!macroend

; ── page 2: the copy ──────────────────────────────────────────────────────────────────────────────
; MUI's own INSTFILES page, so there is no nsDialogs dialog to create: we find the inner dialog and
; put our controls straight onto it.
;
; THE DEFINES HAVE TO BE MADE HERE, NOT AT THE TOP OF THIS FILE. `MUI_PAGE_CUSTOMFUNCTION_SHOW` is
; consumed by the NEXT page macro that asks for one, and multiUserUi.nsh's install-mode page ends its
; PRE with `!insertmacro MUI_PAGE_FUNCTION_CUSTOM SHOW`. Defined any earlier, this function runs as
; THAT page's show callback: measured, it drew the whole "Installing" page over the install-mode radio
; buttons, the copy never started, and the installer sat there for good. `customPageAfterChangeDir` is
; inserted immediately before `MUI_PAGE_INSTFILES` in assistedInstaller.nsh, so it is the one seam
; between the two.
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW ccInstallShow
!macroend

!ifndef BUILD_UNINSTALLER
  ; ── HOVER AND PRESSED, POLLED ────────────────────────────────────────────────────────────────────
  ; A STATIC sends STN_CLICKED on mouse UP and nothing else: no enter, no leave, no button-down. So
  ; the state that makes a control feel alive has to be watched for, and this reads the pointer 20
  ; times a second and repaints only when it crosses a button's edge. A pressed state was built the
  ; same way and REMOVED: while the left button is held over one of these controls the poll stops
  ; reporting the pointer as inside, so the branch never ran.
  ;
  ; THIS IS SAFE HERE AND IS NOT SAFE ON THE COPY PAGE. A timer callback executes NSIS instructions on
  ; the UI thread; on the welcome and finish pages nothing else is executing any, because the script
  ; is parked inside `nsDialogs::Show`. During the copy the install thread IS executing the section,
  ; the two share one set of registers and one stack, and the same trick took the whole installer down
  ; four seconds in. The timer is created after the buttons and killed the moment Show returns.
  Function ccHover
    ${If} $CCbA == 0
    ${AndIf} $CCbB == 0
      Return
    ${EndIf}
    System::Call '*(i 0, i 0) p .s'
    Pop $R9
    System::Call 'user32::GetCursorPos(p $R9)'
    System::Call 'user32::ScreenToClient(p $CCDlg, p $R9)'
    System::Call '*$R9(i .r1, i .r2)'
    System::Free $R9

    ${If} $CCbA <> 0
      !insertmacro CC_HOTSTATE $R7 $CCbAx $CCbAy $CCbAw $CCbAh
      ${If} $R7 != $CCbAs
        StrCpy $CCbAs $R7
        ${If} $R7 == 1
          SetCtlColors $CCbA ${CC_BTN2INK} ${CC_BTN2H}
        ${Else}
          SetCtlColors $CCbA ${CC_BTN2INK} ${CC_BTN2}
        ${EndIf}
        System::Call 'user32::InvalidateRect(p $CCbA, p 0, i 1)'
      ${EndIf}
    ${EndIf}

    StrCpy $R4 $R7
    ${If} $CCbB <> 0
      !insertmacro CC_HOTSTATE $R7 $CCbBx $CCbBy $CCbBw $CCbBh
      ${If} $R7 != $CCbBs
        StrCpy $CCbBs $R7
        ${If} $R7 == 1
          SetCtlColors $CCbB ${CC_VOLTINK} ${CC_VOLTH}
        ${Else}
          SetCtlColors $CCbB ${CC_VOLTINK} ${CC_VOLT}
        ${EndIf}
        System::Call 'user32::InvalidateRect(p $CCbB, p 0, i 1)'
      ${EndIf}
    ${EndIf}

    ${If} $R7 == 1
    ${OrIf} $R4 == 1
      System::Call 'user32::SetCursor(p $CCHand)'
    ${EndIf}
  FunctionEnd

  Function ccInstallShow
    ; The page dialog is identified by the control it owns, never by "the first #32770 child": any
    ; other page dialog still parented to this window would answer that question just as well.
    StrCpy $CCDlg 0
    StrCpy $R7 0
    ${Do}
      FindWindow $R7 "#32770" "" $HWNDPARENT $R7
      ${If} $R7 == 0
        ${ExitDo}
      ${EndIf}
      GetDlgItem $R6 $R7 1004
      ${If} $R6 <> 0
        StrCpy $CCDlg $R7
        StrCpy $CCNativePB $R6
        ${ExitDo}
      ${EndIf}
    ${Loop}
    ${If} $CCDlg == 0
      Return
    ${EndIf}

    StrCpy $CCbA 0
    StrCpy $CCbB 0

    !insertmacro CC_BEGIN 0
    !insertmacro CC_HEADER ${CC_VOLTDIM} ${CC_VOLT} ${CC_LINE}
    !insertmacro CC_RAIL

    !insertmacro CC_CTL ${CC_S_LINE1} 44 122 ${CC_COLW} 44 "Installing" ${CC_INK} ${CC_BG} $CCfH1
    !insertmacro CC_CTL ${CC_S_TEXT} 44 176 ${CC_COLW} 46 "Copying dika.studio into $INSTDIR" ${CC_MUTED} ${CC_BG} $CCfBody

    ; ── THE BAR AND THE NUMBER ARE OURS; A SECOND PROCESS DRIVES THEM ─────────────────────────────
    ; NSIS's own bar stays alive as the source of the figure and goes out of sight, because it is the
    ; one that runs backwards: electron-builder's section first decompresses the package, which NSIS's
    ; File progress drives, and then calls `Nsis7z::Extract`, which resets the same control to zero and
    ; drives it again. What the person sees instead is a track and a fill and a percentage, moved by
    ; ccprogress.exe, which maps the two phases onto 0-40 and 40-100 so the number only ever rises.
    ;
    ; THE HELPER IS A SEPARATE PROCESS AND HAS TO BE. Polling from in here means running NSIS
    ; instructions on the UI thread while the install thread runs the section, and they share one set
    ; of registers, one stack and one string buffer: measured, one run computed 22% from 6618 of
    ; 21500, and the next took the installer down four seconds in. build/progress-helper.nsi carries
    ; the rest, including the control ids, which are the interface between the two scripts.
    ${If} $CCNativePB <> 0
      ShowWindow $CCNativePB ${SW_HIDE}
    ${EndIf}

    !insertmacro CC_CTL ${CC_S_LINE1} 44 236 ${CC_COLW} 54 "0%" ${CC_VOLT} ${CC_BG} $CCfBig
    !insertmacro CC_ID 5002

    !insertmacro CC_CTL ${CC_S_PANEL} 44 302 ${CC_COLW} 10 "" ${CC_BG} ${CC_LINE} $CCfBody
    !insertmacro CC_ID 5000
    !insertmacro CC_CTL ${CC_S_PANEL} 44 302 3 10 "" ${CC_BG} ${CC_VOLT} $CCfBody
    !insertmacro CC_ID 5001

    !insertmacro CC_CTL ${CC_S_LINE1} 44 324 ${CC_COLW} 22 "Starting" ${CC_INK2} ${CC_BG} $CCfBody
    !insertmacro CC_ID 5003
    !insertmacro CC_CTL ${CC_S_LINE1} 44 350 ${CC_COLW} 22 "About 190 MB. Nothing is downloaded." ${CC_FAINT} ${CC_BG} $CCfSmall

    Exec '"$PLUGINSDIR\ccprogress.exe" $HWNDPARENT'
  FunctionEnd
!endif

; ── page 3: finish ────────────────────────────────────────────────────────────────────────────────
!macro customFinishPage
  Page custom ccDoneShow

  Function ccDoneShow
    ; The flag that advanced the finished copy onto this page has to be put down again here, or it
    ; advances past this page too and the installer closes on its own. Measured: the finish page drew
    ; itself, `nsDialogs::Show` returned immediately, and the window vanished with nobody touching it.
    SetAutoClose false
    nsDialogs::Create 1018
    Pop $CCDlg
    ${If} $CCDlg == error
      Abort
    ${EndIf}
    !insertmacro CC_BEGIN 1
    !insertmacro CC_HEADER ${CC_VOLTDIM} ${CC_VOLTDIM} ${CC_VOLT}
    !insertmacro CC_RAIL

    !insertmacro CC_CTL ${CC_S_LINE1} 44 122 ${CC_COLW} 44 "Ready to go" ${CC_INK} ${CC_BG} $CCfH1
    !insertmacro CC_CTL ${CC_S_TEXT} 44 176 ${CC_COLW} 46 "dika.studio is installed on this computer. It is in your Start menu and on your desktop." ${CC_MUTED} ${CC_BG} $CCfBody

    !insertmacro CC_FEATURE 250 "Open a project, or start from a blank page"
    !insertmacro CC_FEATURE 282 "Sign in the first time you open it"

    !insertmacro CC_CTL ${CC_S_PANEL} 44 356 ${CC_COLW} 1 "" ${CC_BG} ${CC_LINE} $CCfBody

    !insertmacro CC_BUTTON A 190 392 106 44 "Close" ${CC_BTN2INK} ${CC_BTN2} ccGoNext
    !insertmacro CC_BUTTON B 310 392 142 44 "Launch dika.studio" ${CC_VOLTINK} ${CC_VOLT} ccLaunch

    ${NSD_CreateTimer} ccHover 30
    nsDialogs::Show
    ${NSD_KillTimer} ccHover
  FunctionEnd

  ; ExecShellAsUser, not ExecShell: the installer may be elevated and the app must not inherit that
  ; token. It is the template's own reason for using it.
  Function ccLaunch
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  FunctionEnd
!macroend
