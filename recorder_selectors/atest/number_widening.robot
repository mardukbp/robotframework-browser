*** Settings ***
Documentation     The number_widening rule of the RecorderSelectors plugin: Playwright drops the
...               number at the start of "46 km/h bis 60 km/h"; the rule gives it back, in a
...               recorded click and in a picked selector.

Library           Browser                        plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless       ${True}
Suite Teardown    Allow Recording Headless       ${False}
Test Setup        Open Page With Speed Radios
Test Teardown     Run Keywords                   End Any Session                                                       AND    Close Page    ALL    AND    Wait For All Promises

Test Tags         recorder


*** Test Cases ***
A Recorded Click Keeps The Leading Number
    ${selector} =     Record Click    id=fast
    Should Contain    ${selector}     46 km/h bis 60 km/h
    Get Attribute     ${selector}     id                     ==    fast

A Picked Selector Keeps The Leading Number
    ${selector} =     Pick Selector    id=fast
    Should Contain    ${selector}      46 km/h bis 60 km/h
    Get Attribute     ${selector}      id                     ==    fast


*** Keywords ***
Open Page With Speed Radios
    Open Recorder Page
    Add Elements
    ...                   <label><input type="radio" name="speed">0 km/h bis 30 km/h</label>
    ...                   <label><input type="radio" name="speed">31 km/h bis 45 km/h</label>
    ...                   <label><input type="radio" name="speed" id="fast">46 km/h bis 60 km/h</label>
