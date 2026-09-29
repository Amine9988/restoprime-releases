; يضيف قاعدة في جدار حماية Windows حتى تصل الأجهزة الأخرى إلى خادم الشبكة المحلية
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
!macroend
