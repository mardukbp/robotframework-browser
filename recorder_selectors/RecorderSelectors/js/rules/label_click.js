// A click on the label of a form control acts on the control, so it is
// recorded by the control's selector, the one its `check` or `fill` gets:
//
//   <label><input type="radio">46 km/h bis 60 km/h</label>
//   text=/^\s*46\s+km\/h.../   becomes   role=radio[name="46 km/h bis 60 km/h"s]

const { role } = require("../kit.js");

module.exports = {
  name: "label_click",
  actions: ["click"],
  retarget: (element) => element.closest("label")?.control ?? null,
  candidates: ({ el }) =>
    el.role && el.name ? [[role(el.role, { name: el.name })]] : [],
};
