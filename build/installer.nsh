; DocuForge installer wizard: branding, the "shortcuts" options page, status messages, and a post-install check
; of the bundled PDF engine.
;
; electron-builder picks this file up automatically (build/installer.nsh) and calls the macros below:
;   customHeader, customPageAfterChangeDir, customInstall, customUnInstall.
; Keep this file ASCII-only (an NSIS script without a byte-order mark is read as ANSI).

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; ---------------------------------------------------------------------------------------------------------
; Branding and wording. These read as the wizard's own pages: Welcome, License, Folder, Options, Install, Finish.
; ---------------------------------------------------------------------------------------------------------
!macro customHeader
  BrandingText "DocuForge   |   Powered by RazaZaidi.AI"
  SetFont "Segoe UI" 9

  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Welcome to DocuForge"
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "This wizard installs DocuForge on your computer.$\r$\n$\r$\nFree, offline PDF and document tools. Your files never leave your computer.$\r$\n$\r$\nPowered by RazaZaidi.AI$\r$\n$\r$\nClick Next to continue."
  !endif
  !ifndef MUI_FINISHPAGE_TITLE
    !define MUI_FINISHPAGE_TITLE "DocuForge is ready"
  !endif
  !ifndef MUI_FINISHPAGE_TEXT
    !define MUI_FINISHPAGE_TEXT "DocuForge was installed successfully.$\r$\n$\r$\nClick Finish to close this wizard."
  !endif
  !ifndef MUI_FINISHPAGE_RUN_TEXT
    !define MUI_FINISHPAGE_RUN_TEXT "Launch DocuForge"
  !endif
!macroend

; ---------------------------------------------------------------------------------------------------------
; Options page, shown after the install-folder page: desktop shortcut and Start Menu shortcut.
; The shortcuts are created in customInstall below (electron-builder's own shortcut creation is switched
; off in electron-builder.yml, so the two checkboxes are the only thing that decides).
; ---------------------------------------------------------------------------------------------------------
!macro customPageAfterChangeDir
  Var /GLOBAL DfDesktopBox
  Var /GLOBAL DfStartMenuBox
  Var /GLOBAL DfDesktopState
  Var /GLOBAL DfStartMenuState

  Page custom DocuForgeOptionsCreate DocuForgeOptionsLeave

  Function DocuForgeOptionsCreate
    !insertmacro MUI_HEADER_TEXT "Choose shortcuts" "Select where DocuForge should be easy to find."

    ; First visit: both on. Coming back from a later page keeps what the user chose.
    ${If} $DfDesktopState == ""
      StrCpy $DfDesktopState ${BST_CHECKED}
    ${EndIf}
    ${If} $DfStartMenuState == ""
      StrCpy $DfStartMenuState ${BST_CHECKED}
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Create shortcuts so you can start DocuForge with one click. You can change this later by pinning or deleting the shortcut."
    Pop $0

    ${NSD_CreateCheckbox} 8u 34u 100% 12u "Create a &desktop shortcut"
    Pop $DfDesktopBox
    ${NSD_SetState} $DfDesktopBox $DfDesktopState

    ${NSD_CreateCheckbox} 8u 54u 100% 12u "Create a &Start Menu shortcut"
    Pop $DfStartMenuBox
    ${NSD_SetState} $DfStartMenuBox $DfStartMenuState

    nsDialogs::Show
  FunctionEnd

  Function DocuForgeOptionsLeave
    ${NSD_GetState} $DfDesktopBox $DfDesktopState
    ${NSD_GetState} $DfStartMenuBox $DfStartMenuState
  FunctionEnd
!macroend

; ---------------------------------------------------------------------------------------------------------
; After the files are copied: shortcuts, then a check that the bundled PDF engine starts.
; The status lines below appear in the installer's progress page.
; A silent install (/S) skips the options page, so the shortcuts default to on, as before.
; ---------------------------------------------------------------------------------------------------------
!macro customInstall
  DetailPrint "Creating shortcuts ..."
  ${If} $DfDesktopState != "0"
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}
  ${If} $DfStartMenuState != "0"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}

  DetailPrint "Checking the PDF engine ..."
  ${If} ${FileExists} "$INSTDIR\resources\engine\docuforge-engine.exe"
    nsExec::ExecToLog '"$INSTDIR\resources\engine\docuforge-engine.exe" --check'
    Pop $0
    DetailPrint "PDF engine check finished (code $0)."
  ${Else}
    DetailPrint "The PDF engine was not found in this installation. DocuForge will ask you to reinstall."
  ${EndIf}

  DetailPrint "Finishing the installation ..."
!macroend

; ---------------------------------------------------------------------------------------------------------
; Uninstall: remove the two shortcuts created above. (The uninstaller itself, the program folder and the
; Apps and features entry are handled by electron-builder; deleteAppDataOnUninstall is set in the yml.)
; ---------------------------------------------------------------------------------------------------------
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
!macroend
