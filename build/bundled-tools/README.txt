Programs placed in this folder are copied into the installer, in the "tools" folder next to the app.

To ship OCR inside the installer (so users do not need to install Tesseract themselves):
  1. Install Tesseract on your build machine (see the Tesseract documentation for Windows installers).
  2. Copy its whole install folder to:  build\bundled-tools\tesseract\
     (it must contain tesseract.exe, its .dll files, and a "tessdata" folder with the languages you want)
  3. Build the installer.
Check the license of every language file you include. DocuForge looks here first, then on your system.
Leave this folder as it is to ship without OCR: DocuForge then uses a Tesseract the user installs.
