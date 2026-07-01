@echo off
REM Dit script gaat uit van een portable node installatie
REM In het voorbeeld hieronder is deze geinstalleerd in:
REM C:\Users\RVR\Documents\GraphQL\node;

SET PATH=C:\Users\RVR\Documents\GraphQL\node;%PATH%
cd /d %~dp0
node server_bemiddeling.js
pause