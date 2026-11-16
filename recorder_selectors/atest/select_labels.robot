*** Settings ***
Documentation     The select labels of the RecorderSelectors plugin: a choice in a select is
...               recorded by the label of the chosen option instead of its generated value,
...               unless that label does not name the option alone or the page changed it.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless    ${True}
Suite Teardown    Allow Recording Headless    ${False}
Test Setup        Open Page With Makes
Test Teardown     Run Keywords    End Any Session    AND    Close Page    ALL    AND    Wait For All Promises

Test Tags         recorder

*** Variables ***
${MAKES}
...         <label>Make <select id="make">
...         <option value="0: null"></option>
...         <option value="14: 6792">AMELUNG</option>
...         <option value="15: 0588">AUDI</option>
...         <option value="83: 0710">DAIMLERCHRYSLER (D)</option>
...         <option value="84: 0710">DAIMLERCHRYSLER (D)</option>
...         </select></label>

*** Test Cases ***
A Choice Is Recorded By The Label Of The Option
    ${call} =    Record Select Call    id=make    14: 6792
    Should Be Equal    ${call}[1:]    ${{['label', 'AMELUNG']}}
    Select Options By    id=make    value    0: null
    Select Options By    ${call}[0]    label    AMELUNG
    Get Selected Options    id=make    value    ==    14: 6792

A Label Two Options Share Keeps The Value
    ${call} =    Record Select Call    id=make    84: 0710
    Should Be Equal    ${call}[1:]    ${{['value', '84: 0710']}}

A Label The Page Changes On The Choice Keeps The Value
    Evaluate JavaScript
    ...    id=make
    ...    (select) => select.addEventListener('change', () => { select.selectedOptions[0].textContent += ' (chosen)'; })
    ${call} =    Record Select Call    id=make    14: 6792
    Should Be Equal    ${call}[1:]    ${{['value', '14: 6792']}}

A Choice In An Iframe Is Recorded By The Label Of The Option
    Evaluate JavaScript
    ...    ${None}
    ...    (makes) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'dealer'; frame.onload = loaded; frame.srcdoc = makes; document.body.prepend(frame); })
    ...    arg=${MAKES}
    ${call} =    Record Select Call    id=dealer >>> id=make    14: 6792
    Should Be Equal    ${call}[1:]    ${{['label', 'AMELUNG']}}
    Select Options By    ${call}[0]    label    AMELUNG
    Get Selected Options    id=dealer >>> id=make    value    ==    14: 6792

*** Keywords ***
Open Page With Makes
    Open Recorder Page
    Add Elements    ${MAKES}

Record Select Call
    [Documentation]    The values of the call Record Keyword records for selecting ${value}
    ...                in ${target}: the selector, the attribute and the options.
    [Arguments]    ${target}    ${value}
    ${promise} =    Promise To    Record Keyword    Recorded Select    ${None}
    Toolbar State Should Be    recording
    Select Options By    ${target}    value    ${value}
    Wait Until Calls    1
    ${call} =    Evaluate JavaScript
    ...    ${None}
    ...    () => window.__rfbToolbarState.calls[0].values.map((value) => value.raw)
    Send Command    {cmd: 'stop'}
    Wait For    ${promise}
    RETURN    ${call}
