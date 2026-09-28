; يضيف قاعدة في جدار حماية Windows حتى تصل الأجهزة الأخرى إلى خادم الشبكة المحلية
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="RestoPrime"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="RestoPrime" dir=in action=allow program="$INSTDIR\RestoPrime.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="RestoPrime"'
!macroend
