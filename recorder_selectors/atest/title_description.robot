*** Settings ***
Documentation     The title_description rule of the RecorderSelectors plugin: a click on an
...               element whose title equals its text and is unique on the page is recorded as
...               role=<role>[description="<title>"s] instead of by its name. Any other click,
...               and a picked selector, are kept as Playwright made them.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Test Page
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Button Whose Unique Title Is Its Text Is Recorded By Its Description
    Add Elements    <button aria-label="Close dialog" title="Close">Close</button>
    ${selector} =    Recorded Click    css=[aria-label="Close dialog"]    internal:role=button[name="Close dialog"i]
    Should Be Equal    ${selector}    role=button[description="Close"s]
    Get Attribute    ${selector}    aria-label    ==    Close dialog

A Link Whose Unique Title Is Its Text Is Recorded By Its Description
    Add Elements    <a href="#help" aria-label="Open help" title="Help">Help</a>
    ${selector} =    Recorded Click    css=[aria-label="Open help"]    internal:role=link[name="Open help"i]
    Should Be Equal    ${selector}    role=link[description="Help"s]
    Get Attribute    ${selector}    aria-label    ==    Open help

A Button Sharing Its Name With Another Is Recorded By Its Description
    Add Elements
    ...    <button class="titled" aria-label="Remove" title="Remove first">Remove first</button>
    ...    <button class="titled" aria-label="Remove" title="Remove second">Remove second</button>
    ${selector} =    Recorded Click
    ...    css=.titled >> nth=1
    ...    internal:role=button[name="Remove"i][description="Remove second"i]
    Should Be Equal    ${selector}    role=button[description="Remove second"s]
    Get Text    ${selector}    ==    Remove second

A Button Removed By Its Click Is Recorded By Its Description Seen At The Press
    Add Elements    <div id="dialog"><button aria-label="Close dialog" title="Close">Close</button></div>
    Evaluate JavaScript    id=dialog    (dialog) => dialog.addEventListener('click', () => dialog.remove())
    ${selector} =    Recorded Click    css=[aria-label="Close dialog"]    internal:role=button[name="Close dialog"i]
    Should Be Equal    ${selector}    role=button[description="Close"s]

A Button Whose Title Differs From Its Text Keeps Its Name
    Add Elements    <button aria-label="Open menu" title="Menu">=</button>
    ${selector} =    Recorded Click    css=[aria-label="Open menu"]    internal:role=button[name="Open menu"i]
    Should Be Equal    ${selector}    internal:role=button[name="Open menu"s]

A Button Whose Title Is Used Twice Keeps Its Name
    Add Elements
    ...    <button aria-label="Keep draft" title="Save">Save</button>
    ...    <button aria-label="Keep copy" title="Save">Save</button>
    ${selector} =    Recorded Click    css=[aria-label="Keep draft"]    internal:role=button[name="Keep draft"i]
    Should Be Equal    ${selector}    internal:role=button[name="Keep draft"s]

A Button Whose Title Is Used Again In A Shadow Root Keeps Its Name
    Add Elements    <button aria-label="Close dialog" title="Close">Close</button><div id="title-host"></div>
    Evaluate JavaScript
    ...    id=title-host
    ...    (host) => { host.attachShadow({mode: 'open'}).innerHTML = '<button aria-label="Close panel" title="Close">Close</button>'; }
    ${selector} =    Recorded Click    css=[aria-label="Close dialog"]    internal:role=button[name="Close dialog"i]
    Should Be Equal    ${selector}    internal:role=button[name="Close dialog"s]

A Button That Already Has A Description Keeps Its Name
    Add Elements
    ...    <span id="hint">Deletes the file</span>
    ...    <button aria-label="Delete file" title="Delete" aria-describedby="hint">Delete</button>
    ${selector} =    Recorded Click    css=[aria-label="Delete file"]    internal:role=button[name="Delete file"i]
    Should Be Equal    ${selector}    internal:role=button[name="Delete file"s]

A Picked Selector Keeps The Name, Since Only A Click Is Recorded By Its Description
    Add Elements    <button aria-label="Close dialog" title="Close">Close</button>
    ${selector} =    Recorded Selector    pick    internal:role=button[name="Close dialog"i]
    Should Not Contain    ${selector}    description
    Get Attribute    ${selector}    aria-label    ==    Close dialog

