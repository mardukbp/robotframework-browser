*** Settings ***
Documentation       Keywords of the RecorderSelectors suites. A test gives the plugin the Action
...                 Playwright reports, through HookProbe.py, and checks the Action the plugin
...                 records: what Browser's recorder does with it is Browser's to test.


*** Keywords ***
Open Test Page
    New Page    ${PAGE_URL}
    Start Recording Hooks

Add Elements
    [Arguments]    @{html}
    VAR    ${elements} =    @{html}    separator=${EMPTY}
    Evaluate JavaScript
    ...    ${None}
    ...    (e) => document.body.insertAdjacentHTML('afterbegin', e)
    ...    arg=${elements}

Recorded Click
    [Documentation]    Clicks ``${target}`` and returns the selector the plugin records for
    ...    the click Playwright reports on ``${reported}``.
    [Arguments]    ${target}    ${reported}
    Click    ${target}
    ${selector} =    Recorded Selector    click    ${reported}
    RETURN    ${selector}

Recorded Select
    [Documentation]    Selects ``${value}`` in ``${target}`` and returns the Action the plugin
    ...    records for the choice Playwright reports on ``${reported}``.
    [Arguments]    ${target}    ${reported}    ${value}
    Select Options By    ${target}    value    ${value}
    ${action} =    Recorded Action    ${{ {"name": "select", "selector": $reported, "options": [$value]} }}
    RETURN    ${action}
