*** Settings ***
Documentation       The acceptance tests of the RecorderSelectors plugin. They serve their
...                 own page, so they need nothing but Browser and this folder.

Library             PageServer.py

Suite Setup         Serve The Test Page
Suite Teardown      Stop Page Server


*** Keywords ***
Serve The Test Page
    ${url} =    Start Page Server
    VAR    ${PAGE_URL} =    ${url}index.html    scope=GLOBAL
