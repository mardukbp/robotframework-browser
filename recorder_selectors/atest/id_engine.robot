*** Settings ***
Documentation     The id_engine rule of the RecorderSelectors plugin: a frame or an element
...               Playwright finds by a CSS id, such as `#oevd-iframe`, is recorded with the
...               `id` engine, without CSS escapes.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Speed Radios In An Iframe
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Click In An Iframe Finds The Iframe By Its Id
    Click    id=oevd-iframe >>> id=slow
    ${selector} =    Recorded Selector
    ...    click
    ...    \#oevd-iframe >> internal:control=enter-frame >> internal:text="Bis 45 km/h"i
    Should Start With    ${selector}    id=oevd-iframe >> internal:control=enter-frame >>
    Get Property    ${selector}    tagName    ==    LABEL

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
