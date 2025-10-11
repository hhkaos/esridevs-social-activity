// Load the table
      try {
        const spreadsheetID = '1oKkHCNbOUpfERu1xC4ePU2XwDSvalEfE0YmTN39cyNg';
        const tab = 'Activity'
        const activityURL = `https://opensheet.elk.sh/${spreadsheetID}/${tab}`;
        fetch(activityURL)
        .then(response => console.log(response.status) || response)
        .then(response => response.text())
        .then(body => {
          console.log(body)
          const res = JSON.parse(body)
          if ("content" in document.createElement("template")) {
          
            const tbody = document.querySelector("calcite-table");
            const template = document.querySelector("#templateRow");
            
            res.forEach( e => {
              const clone = template.content.cloneNode(true);
              const row = clone.firstElementChild;
              let isFeatured = '';
              if(e["Featured"]){
                clone.firstElementChild.setAttribute("class","selected")
                isFeatured = '⭐';
              }
              let td = clone.querySelectorAll("calcite-table-cell");

              td[0].innerText = formatDate(e['Date']);
              if(e['URL'] && e['URL'].toLowerCase() != 'n/a'){
                td[1].innerHTML = `<a href="${e['URL']}" target="_blank" class="emoji">${isFeatured} ${e['Title']}</a>`;
              }else{
                td[1].innerHTML = `${isFeatured} ${e['Title']}`;
              }
              
              td[2].innerText = e['Author'];
              row.setAttribute("data-authors", e['Author'])
              tbody.appendChild(clone);

              td[3].innerText = e['Channel'];
              row.setAttribute("data-channels", e['Channel'])
              tbody.appendChild(clone);
              
              td[4].innerText = e['Language'];
              row.setAttribute("data-languages", e['Language'])
              tbody.appendChild(clone);

              if(e['Linkedin'] && e['Linkedin'].toLowerCase() != 'n/a') {
                td[5].innerHTML = `<a href="${e['Linkedin']}" target="_blank" class="emoji">🔁</a>`;
              }
              if(e['X/Twitter'] && e['X/Twitter'].toLowerCase() != 'n/a'){
                td[6].innerHTML = `<a href="${e['X/Twitter']}" target="_blank" class="emoji">🔁</a>`;
              }
              td[7].innerText = e['Topics_Product'];
              row.setAttribute("data-technologies", e['Topics_Product'])
              td[8].innerText = e['Category'];
              row.setAttribute("data-categories", e['Category'])
              tbody.appendChild(clone);
            })

          } else {
            // Find another way to add the rows to the table because
            // the HTML template element is not supported. ;D
          }
        })
        
      } catch (error) {
        console.error(error.message);
      }