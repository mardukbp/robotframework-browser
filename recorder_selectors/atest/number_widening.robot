*** Settings ***
Documentation     The number_widening rule of the RecorderSelectors plugin: Playwright drops the
...               number at the start of "46 km/h bis 60 km/h"; the rule gives it back, in a
...               recorded click and in a picked selector.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Speed Radios
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Recorded Click Keeps The Leading Number
    Click    id=fast
    ${selector} =    Recorded Selector    check    internal:role=radio[name="km/h bis 60 km/h"i]
    Should Contain    ${selector}    46 km/h bis 60 km/h
    Get Attribute    ${selector}    id    ==    fast

A Picked Selector Keeps The Leading Number
    ${selector} =    Recorded Selector    pick    internal:role=radio[name="km/h bis 60 km/h"i]
    Should Contain    ${selector}    46 km/h bis 60 km/h
    Get Attribute    ${selector}    id    ==    fast


*** Keywords ***
Open Page With Speed Radios
    Open Test Page
    Add Elements
    ...                   <label><input type="radio" name="speed">0 km/h bis 30 km/h</label>
    ...                   <label><input type="radio" name="speed">31 km/h bis 45 km/h</label>
    ...                   <label><input type="radio" name="speed" id="fast">46 km/h bis 60 km/h</label>
