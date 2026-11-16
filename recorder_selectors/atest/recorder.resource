*** Settings ***
Documentation    Keywords that drive Record Keyword and Record Selector from a test, for the
...              suites of the RecorderSelectors plugin.



*** Keywords ***
Open Recorder Page
    New Page               ${PAGE_URL}
    Evaluate JavaScript
    ...                    ${None}
    ...                    () => { sessionStorage.setItem('rfb.toolbar.position', JSON.stringify({x: 5000, y: 5000})); sessionStorage.setItem('rfb.toolbar.collapsed', 'true'); }

Add Elements
    [Arguments]             @{html}
    VAR    ${elements} =    @{html}                                                     separator=${EMPTY}
    Evaluate JavaScript
    ...                     ${None}
    ...                     (e) => document.body.insertAdjacentHTML('afterbegin', e)
    ...                     arg=${elements}

Record Click
    [Documentation]    The selector Record Keyword records for a click on ${target}.
    [Arguments]                ${target}
    ${promise} =               Promise To            Record Keyword    Recorded Click    ${None}
    Toolbar State Should Be    recording
    Click                      ${target}
    Wait Until Calls           1
    ${selectors} =             Recorded Selectors
    Send Command               {cmd: 'stop'}
    Wait For                   ${promise}
    RETURN                     ${selectors}[0]

Record Select
    [Documentation]    The selector Record Keyword records for selecting ${value} in ${target}.
    [Arguments]                ${target}             ${value}
    ${promise} =               Promise To            Record Keyword    Recorded Select    ${None}
    Toolbar State Should Be    recording
    Select Options By          ${target}             value             ${value}
    Wait Until Calls           1
    ${selectors} =             Recorded Selectors
    Send Command               {cmd: 'stop'}
    Wait For                   ${promise}
    RETURN                     ${selectors}[0]

Pick Selector
    [Documentation]    The selector Record Selector returns for a click on ${target}.
    [Arguments]          ${target}
    ${promise} =         Promise To
    ...                  Record Selector
    Wait For Function
    ...                  () => window.__rfbToolbarState && window.__rfbToolbarState.phase === 'picking' && document.body.getAttribute('data-pw-cursor') === 'pointer'
    Click                ${target}
    Wait For Function    () => window.__rfbToolbarState.phase === 'picked'
    Send Command         {cmd: 'use'}
    ${selector} =        Wait For
    ...                  ${promise}
    RETURN               ${selector}

Recorded Selectors
    ${selectors} =    Evaluate JavaScript                                                       ${None}
    ...               () => window.__rfbToolbarState.calls.map((call) => call.values[0].raw)
    RETURN            ${selectors}

Toolbar State Should Be
    [Arguments]          ${state}
    Wait For Function
    ...                  () => window.__rfbToolbarState && window.__rfbToolbarState.state === '${state}' && !window.__rfbToolbarState.pending

Wait Until Calls
    [Arguments]          ${count}
    Wait For Function    () => window.__rfbToolbarState && window.__rfbToolbarState.calls.length === ${count}

Allow Recording Headless
    [Arguments]    ${allow}
    ${lib} =       Get Library Instance                                 Browser
    Evaluate       setattr($lib, "recorder_allows_headless", $allow)

End Any Session
    Run Keyword And Ignore Error    Send Command    {cmd: 'stop'}

Send Command
    [Arguments]            ${command}
    Evaluate JavaScript    ${None}       () => window.__rfbCommand(${command})
