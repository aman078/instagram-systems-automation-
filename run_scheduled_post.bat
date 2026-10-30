@echo off
cd /d "C:\Users\amang\Desktop\instagram-automation"
node src\cron_trigger.js >> logs\scheduler.log 2>&1
