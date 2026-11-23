*** Settings ***
Documentation     The label_scope rule of the RecorderSelectors plugin: a form control without
...               an accessible name, captioned by a plain element beside it, is recorded by
...               its role, scoped by that caption. A control Playwright names is kept.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Captioned Fields
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Selected Option Is Recorded By The Caption Above The Select
    ${action} =    Recorded Select    css=#order >> select >> nth=0    select[name="shippingList"]    express
    Should Be Equal    ${action}[selector]    role=combobox >> scope="Shipping*"
    Get Property    ${action}[selector]    value    ==    express

A Caption That Starts Like Another Caption Finds Its Own Select
    ${action} =    Recorded Select    css=#order >> select >> nth=1    select[name="regionList"]    eu
    Should Be Equal    ${action}[selector]    role=combobox >> scope="Shipping/Region*"
    Get Property    ${action}[selector]    value    ==    eu

A Caption In The Cell Before The Select Scopes It From The Row
    ${action} =    Recorded Select    css=#order >> select >> nth=2    select[name="packagingList"]    gift
    Should Be Equal    ${action}[selector]    role=combobox >> scope="Packaging"
    Get Property    ${action}[selector]    value    ==    gift

A Select In An Iframe Is Recorded By Its Caption
    Evaluate JavaScript
    ...    ${None}
    ...    (fields) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'booking'; frame.onload = loaded; frame.srcdoc = fields; document.body.prepend(frame); })
    ...    arg=${ROOM_FIELDS}
    ${action} =    Recorded Select
    ...    id=booking >>> select[name="roomKeyList"]
    ...    \#booking >> internal:control=enter-frame >> select[name="roomKeyList"]
    ...    double
    Should Be Equal
    ...    ${action}[selector]
    ...    id=booking >> internal:control=enter-frame >> role=combobox >> scope="Room type*"
    Get Property    ${action}[selector]    value    ==    double

A Select In A Cross-Origin Iframe Is Recorded By Its Caption
    ${url} =    Evaluate    $PAGE_URL.replace('localhost', '127.0.0.1')
    Evaluate JavaScript
    ...    ${None}
    ...    (url) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'booking'; frame.onload = loaded; frame.src = url; frame.style.width = '800px'; frame.style.height = '300px'; document.body.prepend(frame); })
    ...    arg=${url}
    Evaluate JavaScript
    ...    id=booking >>> body
    ...    (body, fields) => body.insertAdjacentHTML('afterbegin', fields)
    ...    arg=${ROOM_FIELDS}
    ${action} =    Recorded Select
    ...    id=booking >>> select[name="roomKeyList"]
    ...    \#booking >> internal:control=enter-frame >> select[name="roomKeyList"]
    ...    double
    Should Be Equal
    ...    ${action}[selector]
    ...    id=booking >> internal:control=enter-frame >> role=combobox >> scope="Room type*"
    Get Property    ${action}[selector]    value    ==    double

A Field Whose Label Names A Wrapper With The Same Id Is Recorded By The Label
    Add Elements
    ...    <div><label for="firma">Firmenname*</label>
    ...    <div><span id="firma"><input type="text" id="firma"></span></div></div>
    Fill Text    css=input#firma    imbus
    ${action} =    Recorded Action    ${{ {"name": "fill", "selector": "#firma >> nth=1", "text": "imbus"} }}
    Should Be Equal    ${action}[selector]    role=textbox >> scope="Firmenname*"
    Get Property    ${action}[selector]    value    ==    imbus

A Select With A Label Keeps Its Name
    ${action} =    Recorded Select    id=payment    internal:label="Payment"i    invoice
    Should Be Equal    ${action}[selector]    internal:label="Payment"s


*** Variables ***
${ROOM_FIELDS}
...    <table><tbody><tr>
...    <td><span class="caption">Room type*</span><br><input type="hidden" name="roomKey" value="single">
...    <select name="roomKeyList"><option value="single" selected>Single</option><option value="double">Double</option></select></td>
...    <td><span class="caption">Room type/View*</span><br><input type="hidden" name="viewKey" value="sea">
...    <select name="viewKeyList"><option value="sea" selected>Sea</option></select></td>
...    </tr></tbody></table>


*** Keywords ***
Open Page With Captioned Fields
    Open Test Page
    Add Elements
    ...                   <table id="order"><tbody>
    ...                   <tr><td><span class="caption">Shipping*</span><br><input type="hidden" name="shippingKey" value="standard">
    ...                   <select name="shippingList"><option value="standard" selected>Standard</option><option value="express">Express</option></select></td>
    ...                   <td><span class="caption">Shipping/Region*</span><br><input type="hidden" name="regionKey" value="us">
    ...                   <select name="regionList"><option value="us" selected>US</option><option value="eu">EU</option></select></td></tr>
    ...                   <tr><td><b>Packaging</b></td>
    ...                   <td><select name="packagingList"><option value="box" selected>Box</option><option value="gift">Gift wrap</option></select></td></tr>
    ...                   <tr><td><label for="payment">Payment</label>
    ...                   <select id="payment"><option value="card" selected>Card</option><option value="invoice">Invoice</option></select></td></tr>
    ...                   </tbody></table>
