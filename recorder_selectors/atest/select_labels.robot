*** Settings ***
Documentation     The select labels of the RecorderSelectors plugin: a choice in a select is
...               recorded by the label of the chosen option instead of its generated value,
...               unless that label does not name the option alone or the page changed it.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Makes
Test Teardown     Close Page    ALL

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
    ${action} =    Recorded Select    id=make    internal:label="Make AMELUNG AUDI"i    14: 6792
    Should Be Equal    ${action}[by]    label
    Should Be Equal    ${action}[options]    ${{['AMELUNG']}}
    Select Options By    id=make    value    0: null
    Select Options By    ${action}[selector]    label    AMELUNG
    Get Selected Options    id=make    value    ==    14: 6792

A Label Two Options Share Keeps The Value
    ${action} =    Recorded Select    id=make    internal:label="Make AMELUNG AUDI"i    84: 0710
    Should Not Contain    ${action}    by
    Should Be Equal    ${action}[options]    ${{['84: 0710']}}

A Label The Page Changes On The Choice Keeps The Value
    Evaluate JavaScript
    ...    id=make
    ...    (select) => select.addEventListener('change', () => { select.selectedOptions[0].textContent += ' (chosen)'; })
    ${action} =    Recorded Select    id=make    internal:label="Make AMELUNG AUDI"i    14: 6792
    Should Not Contain    ${action}    by
    Should Be Equal    ${action}[options]    ${{['14: 6792']}}

A Choice In An Iframe Is Recorded By The Label Of The Option
    Evaluate JavaScript
    ...    ${None}
    ...    (makes) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'dealer'; frame.onload = loaded; frame.srcdoc = makes; document.body.prepend(frame); })
    ...    arg=${MAKES}
    ${action} =    Recorded Select
    ...    id=dealer >>> id=make
    ...    \#dealer >> internal:control=enter-frame >> internal:label="Make AMELUNG AUDI"i
    ...    14: 6792
    Should Be Equal    ${action}[by]    label
    Should Be Equal    ${action}[options]    ${{['AMELUNG']}}
    Select Options By    id=dealer >>> id=make    value    0: null
    Select Options By    ${action}[selector]    label    AMELUNG
    Get Selected Options    id=dealer >>> id=make    value    ==    14: 6792


*** Keywords ***
Open Page With Makes
    Open Test Page
    Add Elements    ${MAKES}
