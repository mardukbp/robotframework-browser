*** Settings ***
Documentation     The id_engine rule of the RecorderSelectors plugin: an element Playwright
...               finds by a CSS id, such as `#APD_\\:\\:Save`, is recorded with the `id`
...               engine, without CSS escapes. The frames before it stay as Playwright
...               recorded them.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Speed Radios In An Iframe
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
An Iframe Found By Its Id Keeps The CSS Id Playwright Recorded
    Click    id=oevd-iframe >>> id=slow
    ${selector} =    Recorded Selector
    ...    click
    ...    \#oevd-iframe >> internal:control=enter-frame >> internal:text="Bis 45 km/h"i
    Should Start With    ${selector}    \#oevd-iframe >> internal:control=enter-frame >>
    Get Property    ${selector}    tagName    ==    LABEL

An Element In An Iframe Is Recorded By Its Id Without CSS Escapes
    Evaluate JavaScript    id=oevd-iframe >>> id=slow
    ...    (input) => { input.id = 'APD_::Slow'; }
    ${selector} =    Recorded Selector
    ...    click
    ...    \#oevd-iframe >> internal:control=enter-frame >> \#APD_\\:\\:Slow
    Should Be Equal    ${selector}    \#oevd-iframe >> internal:control=enter-frame >> id=APD_::Slow
    Get Property    ${selector}    type    ==    radio

An Id With CSS Escapes Is Recorded Without Them
    Add Elements    <button id="APD_::Save">Save</button>
    ${selector} =    Recorded Click    id=APD_::Save    \#APD_\\:\\:Save
    Should Be Equal    ${selector}    id=APD_::Save


*** Variables ***
${SPEED_RADIOS}
...    <label><input type="radio" name="speed" id="slow">Bis 45 km/h</label>
...    <label><input type="radio" name="speed">Bis 60 km/h</label>


*** Keywords ***
Open Page With Speed Radios In An Iframe
    Open Test Page
    Evaluate JavaScript
    ...    ${None}
    ...    (radios) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'oevd-iframe'; frame.onload = loaded; frame.srcdoc = radios; document.body.prepend(frame); })
    ...    arg=${SPEED_RADIOS}
