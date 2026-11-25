*** Settings ***
Documentation     The rules named after the plugin, each after a ``;``, are the only rules that
...               run, in the plugin's order.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors;exact_names;id_engine,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Test Page
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
Only The Rules Named After The Plugin Run
    Add Elements    <button id="APD_::Help" role="button" aria-label="Wertehilfe einblenden">?</button>
    ${selector} =    Recorded Click    id=APD_::Help    \#APD_\\:\\:Help
    Should Be Equal    ${selector}    id=APD_::Help
