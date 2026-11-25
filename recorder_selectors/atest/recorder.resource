*** Settings ***
Documentation       Keywords of the RecorderSelectors suites. A test gives the plugin the Action
...                 Playwright reports, through HookProbe.py, and checks the selector the plugin
...                 records: what Browser's recorder does with it is Browser's to test. The
...                 plugin's hook runs before the Action happens, as in a recording.


*** Keywords ***
Open Test Page
    New Page    ${PAGE_URL}

Add Elements
    [Arguments]    @{html}
    VAR    ${elements} =    @{html}    separator=${EMPTY}
    Evaluate JavaScript
    ...    ${None}
    ...    (e) => document.body.insertAdjacentHTML('afterbegin', e)
    ...    arg=${elements}

Recorded Click
    [Documentation]    Returns the selector the plugin records for the click Playwright
    ...    reports on ``${reported}``, and clicks ``${target}``.
    [Arguments]    ${target}    ${reported}
    ${selector} =    Recorded Selector    click    ${reported}
    Click    ${target}
    RETURN    ${selector}

Recorded Select
    [Documentation]    Returns the selector the plugin records for the choice of ``${value}``
    ...    Playwright reports on ``${reported}``, and selects it in ``${target}``.
    [Arguments]    ${target}    ${reported}    ${value}
    ${selector} =    Recorded Selector    select    ${reported}
    Select Options By    ${target}    value    ${value}
    RETURN    ${selector}
