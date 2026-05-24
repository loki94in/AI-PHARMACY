const fs = require('fs');
const path = 'e:/CURRENT PROJECT ON WORKING/AI PHARMACY/ui-demo.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Update Page 2 KPIs
html = html.replace(
  /<div class="kpi sky">[\s\S]*?<div class="kpi-label">Today's Sales<\/div>[\s\S]*?<div class="kpi-value">.*?<\/div>[\s\S]*?<div class="kpi-delta">.*?<\/div>[\s\S]*?<\/div>/,
  `<div class="kpi sky">
          <div class="kpi-label">Today's Sales</div>
          <div class="kpi-value" data-key="page2" data-field="sales">₹48,230</div>
          <div class="kpi-delta" data-key="page2" data-field="salesDelta">▲ 12.4% vs yesterday</div>
        </div>`
);

html = html.replace(
  /<div class="kpi green">[\s\S]*?<div class="kpi-label">Gross Profit<\/div>[\s\S]*?<div class="kpi-value">.*?<\/div>[\s\S]*?<div class="kpi-delta">.*?<\/div>[\s\S]*?<\/div>/,
  `<div class="kpi green">
          <div class="kpi-label">Gross Profit</div>
          <div class="kpi-value" data-key="page2" data-field="profit">₹9,640</div>
          <div class="kpi-delta" data-key="page2" data-field="profitDelta">▲ 8.1% vs yesterday</div>
        </div>`
);

html = html.replace(
  /<div class="kpi orange">[\s\S]*?<div class="kpi-label">Low-Stock Items<\/div>[\s\S]*?<div class="kpi-value">.*?<\/div>[\s\S]*?<div class="kpi-delta neg">.*?<\/div>[\s\S]*?<\/div>/,
  `<div class="kpi orange">
          <div class="kpi-label">Low-Stock Items</div>
          <div class="kpi-value" data-key="page2" data-field="lowStock">17</div>
          <div class="kpi-delta neg" data-key="page2" data-field="lowStockDelta">▲ 3 new alerts</div>
        </div>`
);

html = html.replace(
  /<div class="kpi purple">[\s\S]*?<div class="kpi-label">Pending Tasks<\/div>[\s\S]*?<div class="kpi-value">.*?<\/div>[\s\S]*?<div class="kpi-delta">.*?<\/div>[\s\S]*?<\/div>/,
  `<div class="kpi purple">
          <div class="kpi-label">Pending Tasks</div>
          <div class="kpi-value" data-key="page2" data-field="tasks">5</div>
          <div class="kpi-delta" data-key="page2" data-field="tasksDelta">2 urgent</div>
        </div>`
);

// 2. Update Page 3 Inventory Table
html = html.replace(
  /<tbody>[\s\S]*?<\/tbody>/,
  `<tbody data-list-key="page3" data-list="inventory">
            <template>
              <tr>
                <td class="text-white fw700" data-field="name"></td>
                <td class="text-muted" data-field="comp"></td>
                <td class="text-white fw700" data-field="qty"></td>
                <td class="mono" data-field="rack"></td><td class="mono" data-field="batch"></td>
                <td data-field="exp" data-class-bind="expClass"></td>
                <td data-field="reorder"></td>
                <td><span class="badge" data-field="status" data-class-bind="statusClass"></span></td>
                <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;">Edit</button></td>
              </tr>
            </template>
          </tbody>`
);

fs.writeFileSync(path, html, 'utf8');
console.log('UI Data binding updated successfully.');
