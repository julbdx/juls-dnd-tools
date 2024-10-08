export class JulMerchantSheet extends dnd5e.applications.actor.ActorSheet5eNPC2 {
    static FLAG = 'juls-dnd-tools';
  
    /**
     * Handles Currency from currency.TYPE.value to currency.TYPE for backwords support
     * @param {string} folderPath - The directory to loop through
     */
    static convertCurrencyFromObject(currency) {
        Object.entries(currency).map(([key, value]) => {
        currency[key] = value?.value ?? value ?? 0
        })
        return currency
    }

    /**
     * Retrieve the loot permission for a player, given the current actor system.
     *
     * It first tries to get an entry from the actor's permissions, if none is found it uses default, otherwise returns 0.
     *
     */
    static getLootPermissionForPlayer(actorData, player) {
      let defaultPermission = actorData.ownership.default
      if (player.playerId in actorData.ownership) {
        return actorData.ownership[player.playerId]
      } else if (typeof defaultPermission !== 'undefined') {
        return defaultPermission
      } else {
        return 0
      }
    }

    // Méthode pour personnaliser l'affichage du titre
    _getHeaderButtons() {
      let buttons = super._getHeaderButtons();
      // Supprime la partie XP du titre dans la barre de titre
      // si l'utilisateur n'est pas un MJ, on retire les boutons
      if (!game.user.isGM) {
        buttons = buttons.filter(button => button.label !== "Sheet");
        buttons = buttons.filter(button => button.label !== "Token");
      }
      return buttons;
  }

    get template() {
      Handlebars.registerHelper('ifeq', function (a, b, options) {
        if (a == b) {
          return options.fn(this)
        }
        return options.inverse(this)
      });

      Handlebars.registerHelper('notequal', function (value1, value2, options) {
        return value1 != value2 ? options.fn(this) : options.inverse(this)
      });

      // adding the #equals and #unequals handlebars helper
      Handlebars.registerHelper('equals', function (arg1, arg2, options) {
        return arg1 == arg2 ? options.fn(this) : options.inverse(this)
      })
  
      // Register the 'ifnot' helper
      Handlebars.registerHelper('ifnot', function (condition, options) {
        // Check if the condition is false, null, undefined, or falsy
        if (!condition) {
          return options.fn(this) // Render the block if the condition is falsy
        } else {
          return options.inverse(this) // Render the else block if the condition is true
        }
      })
  
      Handlebars.registerHelper('unequals', function (arg1, arg2, options) {
        return arg1 != arg2 ? options.fn(this) : options.inverse(this)
      })
  
      Handlebars.registerHelper('ifnoteq', function (a, b, options) {
        if (a != b) {
          return options.fn(this)
        }
        return options.inverse(this)
      })
  
      Handlebars.registerHelper('lootsheetprice', function (basePrice, modifier) {
        return (Math.round(basePrice * modifier * 100) / 100).toLocaleString('en')
      })
    
      Handlebars.registerHelper('lootsheetweight', function (weight) {
        return (Math.round(weight.value * 1e5) / 1e5).toString()
      })
  
      const path = 'systems/dnd5e/templates/actors/'
      if (!game.user.isGM && this.actor.limited) return path + 'limited-sheet.hbs'
      return 'modules/juls-dnd-tools/templates/merchant-sheet.hbs'
    }
  
    static get defaultOptions() {
      const options = super.defaultOptions
  
      foundry.utils.mergeObject(options, {
        classes: ['dnd5e2 sheet actor npc vertical-tabs dtjul-merchant'],
        width: 890,
        height: 750,
      })
      return options
    }
  
    async getData() {
      const sheetData = await super.getData()
  
      // Prepare GM Settings
      this._prepareGMSettings(sheetData.actor)
  
      // Prepare isGM attribute in sheet Data
      sheetData.isGM = game.user.isGM;      
  
      let priceModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'priceModifier')
      if (typeof priceModifier !== 'number')
      {
        priceModifier = 1.0;
        await this.actor.setFlag(JulMerchantSheet.FLAG, 'priceModifier', priceModifier);
      }      
  
      let selectedRollTable = await this.actor.getFlag(JulMerchantSheet.FLAG, 'rolltable')
  
      let clearInventory = await this.actor.getFlag(JulMerchantSheet.FLAG, 'clearInventory')
  
      let itemQty = await this.actor.getFlag(JulMerchantSheet.FLAG, 'itemQty')
  
      let itemQtyLimit = await this.actor.getFlag(JulMerchantSheet.FLAG, 'itemQtyLimit')
  
      let shopQty = await this.actor.getFlag(JulMerchantSheet.FLAG, 'shopQty')
        
      sheetData.selectedRollTable = selectedRollTable;
      sheetData.itemQty = itemQty;
      sheetData.itemQtyLimit = itemQtyLimit;
      sheetData.shopQty = shopQty;
      sheetData.clearInventory = clearInventory;
      sheetData.priceModifier = priceModifier;
      sheetData.rolltables = game.tables.contents;
      // console.log(game.tables);      
      sheetData.system.currency = JulMerchantSheet.convertCurrencyFromObject(
        sheetData.system.currency,
      );

      
      sheetData.buyerFunds = JulMerchantSheet.convertCurrencyFromObject(
        game.user.character?.system.currency ?? [],
      );
        
      // console.log("sheetdata", sheetData);
      //console.log("this actor", this.actor);
      sheetData.myPortrait = this.token.texture.src;
  
      // Return data for rendering
      return sheetData;
    }
  
    /* -------------------------------------------- */
    /*  Event Listeners and Handlers
      /* -------------------------------------------- */
  
    /**
     * Activate event listeners using the prepared sheet HTML
     * @param html {HTML}   The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
      super.activateListeners(html)
      if (this.options.editable) {
        // Toggle Permissions
        html.find('.permission-proficiency').click((ev) => this._onCyclePermissionProficiency(ev))
        html
          .find('.permission-proficiency-bulk')
          .click((ev) => this._onCyclePermissionProficiencyBulk(ev))
  
        // Price Modifier
        html.find('.price-modifier').click((ev) => this._priceModifier(ev))
  
        html.find('.merchant-settings').change((ev) => this._merchantSettingChange(ev))
        html.find('.update-inventory').click((ev) => this._merchantInventoryUpdate(ev))
        html.find('.clear-inventory.slide-toggle').click((ev) => this._clearInventoryChange(ev))
  
        const selectRollTable = document.getElementById('lootsheet-rolltable')
        const buttonUpdateInventory = document.getElementById('update-inventory')
  
        if (selectRollTable) {
          buttonUpdateInventory.disabled = !selectRollTable.value
          selectRollTable.addEventListener('change', function () {
            // Enable the button only if the selected value is not blank
            buttonUpdateInventory.disabled = !selectRollTable.value
          })
        }
      }
    
      // Buy Item
      html.find('.item-buy').click((ev) => this._buyItem(ev))
      //html.find('.item-buyall').click((ev) => this._buyItem(ev, 1))
        
      // Select the <nav> element and find all <a> elements inside it
      const nav = $('.dtjul-merchant nav.tabs')
      const links = nav.find('a.item.control')
  
      // Check if the first tab's data-tab attribute is not "features"
      if (links.first().attr('data-tooltip') !== 'DND5E.Inventory') {
        // Si l'utilisateur est le GM
        if (game.user.isGM) {
          // Move the second <a> to the first position
          if (links.eq(1).length) {
            links.eq(1).insertBefore(links.eq(0)) // Move the second <a> before the first <a>
          }
    
          // Move the fifth <a> to the second position
          if (links.eq(4).length) {
            links.eq(4).insertAfter(nav.find('a.item.control').first()) // Move the fifth <a> to after the new first <a>
          }
    
          // Remove the remaining <a> elements (original first, third, and fourth)
          nav.find('a.item.control').slice(2).remove() // Remove from the third onward
    
          // Set the data-tab attribute to features
          nav.find('a.item.control').first().attr('data-tab', 'features')
    
          // Check if no <li> elements have the 'active' class
          if (!nav.find('a.active').length) {
            // Add the "active" class to the new first <a> element if no other <li> is active
            nav.find('a.item.control').first().addClass('active')
          }
        }
        else{
          // Sinon on supprime tout le reste
          nav.find('a.item.control').slice(1).remove() // Remove from the second onward
        }
      }

      // Désactiver le drag & drop dans la liste d'inventaire
      html.find('.item-list .item').each((i, item) => {
        item.setAttribute('draggable', false); // Désactiver la capacité de faire un drag
        $(item).on('dragstart', (event) => {
            event.preventDefault(); // Empêche le comportement de drag & drop
        });            
      });

      // Si ce n'est pas le maître du jeu, on désactive le drop du drag&drop
      if (true || !game.user.isGM) {        
        html.find('.item-list').on('drop', (event) => {
          event.preventDefault(); // Empêcher l'opération de drop
          ui.notifications.warn("Vous ne pouvez pas vendre d'article à ce marchand pour l'instant."); // Message d'avertissement
          return false;
      });
      } 
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle merchant settings change
     * @private
     */
    async _merchantSettingChange(event) {
      event.preventDefault()
      // console.log("Loot Sheet | Merchant settings changed");
  
      const moduleNamespace = JulMerchantSheet.FLAG
      const expectedKeys = [
        'rolltable',
        'shopQty',
        'itemQty',
        'itemQtyLimit',
        // 'clearInventory',
        'itemOnlyOnce',
      ]
  
      let targetKey = event.target.name.split('.')[3]
      console.log(event)
      if (expectedKeys.indexOf(targetKey) === -1) {
        // console.log(`Loot Sheet | Error changing stettings for "${targetKey}".`);
        return ui.notifications.error(`Error changing stettings for "${targetKey}".`)
      }
  
      if (targetKey == 'clearInventory' || targetKey == 'itemOnlyOnce') {
        //console.log(targetKey + ' set to ' + event.target.checked)
        await this.actor.setFlag(moduleNamespace, targetKey, event.target.checked)
      } else if (event.target.value) {
        //console.log(targetKey + ' set to ' + event.target.value)
        await this.actor.setFlag(moduleNamespace, targetKey, event.target.value)
      } else {
        //console.log(targetKey + ' set to ' + event.target.value)
        await this.actor.unsetFlag(moduleNamespace, targetKey, event.target.value)
      }
    }
  
    /**
     * Handle clear inventory settings change
     * @private
     */
    async _clearInventoryChange(event) {
      // Prevent default behavior of label-click that directly interacts with the checkbox
      event.preventDefault()
  
      const clickedElement = $(event.currentTarget)
  
      // Find the checkbox and icon within the label
      const checkbox = clickedElement.find('input[type="checkbox"]')[0]
      const icon = clickedElement.find('i')[0]
  
      // Toggle the checkbox checked state
      checkbox.checked = !checkbox.checked
  
      // Update the icon class based on the checkbox state
      if (checkbox.checked) {
        icon.classList.remove('fa-toggle-off')
        icon.classList.add('fa-toggle-on')
      } else {
        icon.classList.remove('fa-toggle-on')
        icon.classList.add('fa-toggle-off')
      }
  
      // console.log("Loot Sheet | ClearInventory Changed");
  
      await this.actor.setFlag(JulMerchantSheet.FLAG, 'clearInventory', checkbox.checked)
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle merchant inventory update
     * @private
     */
    async _merchantInventoryUpdate(event, html) {
      event.preventDefault()
  
      const moduleNamespace = JulMerchantSheet.FLAG
      const rolltableName = this.actor.getFlag(moduleNamespace, 'rolltable')
      const shopQtyFormula = this.actor.getFlag(moduleNamespace, 'shopQty') || '1'
      const itemQtyFormula = this.actor.getFlag(moduleNamespace, 'itemQty') || '1'
      const itemQtyLimit = this.actor.getFlag(moduleNamespace, 'itemQtyLimit') || '0'
      const clearInventory = this.actor.getFlag(moduleNamespace, 'clearInventory')
      const itemOnlyOnce = this.actor.getFlag(moduleNamespace, 'itemOnlyOnce')
      const reducedVerbosity = false;
  
      let shopQtyRoll = new Roll(shopQtyFormula)
  
      await shopQtyRoll.evaluate()
      // console.log("Adding ${shopQtyRoll.result} items.");
      let rolltable = game.tables.getName(rolltableName)
      if (!rolltable) {
        return ui.notifications.error(`No Rollable Table found with name "${rolltableName}".`)
      }
  
      if (itemOnlyOnce) {
        if (rolltable.results.length < shopQtyRoll.result) {
          return ui.notifications.error(
            `Cannot create a merchant with ${shopQtyRoll.result} unqiue entries if the rolltable only contains ${rolltable.results.length} items`,
          )
        }
      }
  
      if (clearInventory) {
        let currentItems = this.actor.items.map((i) => i.id);
        await this.actor.deleteEmbeddedDocuments('Item', currentItems);
      }
  
      // console.log(`Loot Sheet | Adding ${shopQtyRoll.result} new items`);
  
      for (let i = 0; i < shopQtyRoll.result; i++) {
        const rollResult = await rolltable.roll()
        let itemToAdd = null
  
        if (rollResult.results[0].documentCollection === 'Item') {
          itemToAdd = game.items.get(rollResult.results[0].documentId)
        } else {
          // Try to find it in the compendium
          const items = game.packs.get(rollResult.results[0].documentCollection)
          itemToAdd = await items.getDocument(rollResult.results[0].documentId)
        }
        if (!itemToAdd || itemToAdd === null) {
          return ui.notifications.error(`No item found "${rollResult.results[0].documentId}".`)
        }
  
        if (itemToAdd.type === 'spell') {
          itemToAdd = await Item5e.createScrollFromSpell(itemToAdd)
        }
  
        let itemQtyRoll = new Roll(itemQtyFormula)
        await itemQtyRoll.evaluate()
  
        //console.log(itemQtyRoll.total);
        // console.log(
        //   `Loot Sheet | Adding ${itemQtyRoll.total} x ${itemToAdd.name}`
        // );
  
        let existingItem = this.actor.items.find((item) => item.name == itemToAdd.name)
  
        if (existingItem === undefined) {
          // console.log(`Loot Sheet | ${itemToAdd.name} does not exist.`);
  
          const createdItems = await this.actor.createEmbeddedDocuments('Item', [
            itemToAdd.toObject(),
          ])
          let newItem = createdItems[0]
  
          if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(itemQtyRoll.total)) {
            await newItem.update({
              'system.quantity': itemQtyLimit,
            })
            if (!reducedVerbosity)
              ui.notifications.info(`Added new ${itemQtyLimit} x ${itemToAdd.name}.`)
          } else {
            await newItem.update({
              'system.quantity': itemQtyRoll.total,
            })
            if (!reducedVerbosity)
              ui.notifications.info(`Added new ${itemQtyRoll.total} x ${itemToAdd.name}.`)
          }
        } else {
          // console.log(
          //   `Loot Sheet | Item ${itemToAdd.name} exists.`,
          //   existingItem
          // );
          // console.log("existingqty", existingItem.system.quantity);
          // console.log("toadd", itemQtyRoll.total);
          let newQty = Number(existingItem.system.quantity) + Number(itemQtyRoll.total)
          //console.log("newqty", newQty);
  
          if (itemQtyLimit > 0 && Number(itemQtyLimit) === Number(existingItem.system.quantity)) {
            if (!reducedVerbosity)
              ui.notifications.info(
                `${itemToAdd.name} already at maximum quantity (${itemQtyLimit}).`,
              )
          } else if (itemQtyLimit > 0 && Number(itemQtyLimit) < Number(newQty)) {
            let updateItem = {
              _id: existingItem.id,
              data: {
                quantity: itemQtyLimit,
              },
            }
            await this.actor.updateEmbeddedDocuments('Item', [updateItem])
            if (!reducedVerbosity)
              ui.notifications.info(
                `Added additional quantity to ${itemToAdd.name} to the specified maximum of ${itemQtyLimit}.`,
              )
          } else {
            let updateItem = {
              _id: existingItem.id,
              system: {
                quantity: newQty,
              },
            }
            //console.log(updateItem);
            await this.actor.updateEmbeddedDocuments('Item', [updateItem])
  
            if (!reducedVerbosity)
              ui.notifications.info(
                `Added additional ${itemQtyRoll.total} quantity to ${existingItem.name}.`,
              )
          }
        }
      }
    }
  
    _createRollTable() {
      let type = 'weapon'
  
      game.packs.map((p) => p.collection)
  
      const pack = game.packs.find((p) => p.collection === 'dnd5e.items')
  
      let i = 0
  
      let output = []
  
      pack.getIndex().then((index) =>
        index.forEach(function (arrayItem) {
          var x = arrayItem._id
          i++
          pack.getEntity(arrayItem._id).then((packItem) => {
            if (packItem.type === type) {
              let newItem = {
                _id: packItem._id,
                flags: {},
                type: 1,
                text: packItem.name,
                img: packItem.img,
                collection: 'Item',
                resultId: packItem._id,
                weight: 1,
                range: [i, i],
                drawn: false,
              }
  
              output.push(newItem)
            }
          })
        }),
      )
  
      return
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle buy item
     * @private
     */
    _buyItem(event, all = 0) {
      event.preventDefault()
      // console.log("Loot Sheet | Buy Item clicked");      
  
      if (this.token === null) {
        return ui.notifications.error(`You must purchase items from a token.`)
      }
      // console.log(game.user.character);
      if (!game.user.character) {
        // console.log("Loot Sheet | No active character for user");
        return ui.notifications.error(`No active character for user.`)
      }
  
      const itemId = $(event.currentTarget).parents('.item').attr('data-item-id')
      const targetItem = this.actor.getEmbeddedDocument('Item', itemId)
  
      const item = {
        itemId: itemId,
        quantity: 1,
      }
  
      const data = {
        buyerId: game.user.character._id,
        tokenId: this.token.id,
        itemId: itemId,
        quantity: 1,
      }

      /** gestion de la vente ici ! */
      let buyer = game.actors.get(data.buyerId);
      let seller = canvas.tokens.get(data.tokenId);

      if (buyer && seller && seller.actor)
          this.transaction(seller.actor, buyer, data.itemId, data.quantity);  
    }

    /**
     * Effectue la transaction
     * 
     * @param {} seller 
     * @param {*} buyer 
     * @param {*} itemId 
     * @param {*} quantity 
     * @returns 
     */
    async transaction(seller, buyer, itemId, quantity) {
      let sellItem = seller.getEmbeddedDocument('Item', itemId)
  
      // If the buyer attempts to buy more then what's in stock, buy all the stock.
      if (sellItem.system.quantity < quantity) {
        quantity = sellItem.system.quantity
      }
  
      // On negative quantity we show an error
      if (quantity < 0) {
        ui.notifications.warn("Vous ne pouvez pas acheter un montant négatif de marchandise."); // Message d'avertissement
        return;
      }
  
      // On 0 quantity skip everything to avoid error down the line
      if (quantity == 0) {
        ui.notifications.warn("Pas assez de stock pour acheter."); // Message d'avertissement
        return
      }
  
      let sellerModifier = seller.getFlag(JulMerchantSheet.FLAG, 'priceModifier')
      if (typeof sellerModifier !== 'number') sellerModifier = 1.0
  
      let itemCostRaw = Math.round(sellItem.system.price.value * sellerModifier * 100) / 100
      let itemCostDenomination = sellItem.system.price.denomination
  
      itemCostRaw *= quantity
  
      // console.log("itemCostRaw", itemCostRaw);
      // console.log("itemCostDenomination", itemCostDenomination);
  
      let buyerFunds = foundry.utils.duplicate(
        JulMerchantSheet.convertCurrencyFromObject(buyer.system.currency),
      )
  
      let sellerFunds = foundry.utils.duplicate(
        JulMerchantSheet.convertCurrencyFromObject(seller.system.currency),
      )
  
      // console.log("sellerFunds before", sellerFunds);
      // console.log("buyerFunds before purchase", buyerFunds);
      //maybe realize later
      let blockCurencies = ['ep']
  
      const conversionRates = {
        pp: 1000,
        gp: 100,
        ep: 50,
        sp: 10,
        cp: 1,
      }
  
      const compensationCurrency = {
        pp: 'gp',
        gp: 'sp',
        ep: 'sp',
        sp: 'cp',
      }
  
      let convert = (funds) => {
        let wallet = 0
        for (const coin in conversionRates) {
          wallet += funds[coin] * conversionRates[coin]
        }
        return wallet
      }
      //why bronze? because there will be no float
      let buyerFundsAsBronze = convert(buyerFunds)
  
      let itemCostInBronze = itemCostRaw * conversionRates[itemCostDenomination]
      // console.log(`itemCostInPlatinum : ${itemCostInPlatinum}`);
  
      // console.log(`buyerFundsAsPlatinum : ${buyerFundsAsPlatinum}`);
      if (itemCostInBronze >= buyerFundsAsBronze) {
        ui.notifications.warn("Vous n'avez pas suffisamment d'argent pour acheter cette marchandise."); // Message d'avertissement
        return
      }
      //maybe realize later
      const GoToAnotherShopToExchange = true
  
      if (buyerFunds[itemCostDenomination] >= itemCostRaw) {
        buyerFunds[itemCostDenomination] -= itemCostRaw
        sellerFunds[itemCostDenomination] += itemCostRaw
      } else {
        let payCoinCount = (coin, coinCost) => {
          let payedThisCoins =
            itemCostInBronze < coinCost
              ? coinCost - (coinCost - Math.abs(itemCostInBronze))
              : coinCost
          return payedThisCoins / conversionRates[coin]
        }
        //we go through all the coins and try to pay off using them
        //a little magic with data types
        let ratesLikeArray = Object.entries(conversionRates)
        ratesLikeArray.sort((a, b) => b[1] - a[1])
        for (const i in ratesLikeArray) {
          let coin = ratesLikeArray[i][0]
          //calculating how many coins of this type I owe
          const amountCoin = buyerFunds[coin]
          if (amountCoin == 0) continue
          let coinCost = amountCoin * conversionRates[coin]
          let payedCoin = Math.floor(payCoinCount(coin, coinCost))
          itemCostInBronze -= payedCoin * conversionRates[coin]
  
          //Subtract from the buyer and add to the seller
          buyerFunds[coin] -= payedCoin
          sellerFunds[coin] += payedCoin
          if (itemCostInBronze == 0) break
        }
        //if we have any left over
  
        if (itemCostInBronze !== 0) {
          let iteration = 0
          let _oldItemCostInbronze
          let _sortStop = itemCostInBronze < 0 ? true : false
          trychange: while (itemCostInBronze != 0) {
            if (_sortStop && itemCostInBronze < 0) {
              ratesLikeArray.sort((a, b) => b[1] - a[1])
              _sortStop = !_sortStop
            } else if (!_sortStop && itemCostInBronze > 0) {
              ratesLikeArray.sort((a, b) => a[1] - b[1])
              _sortStop = !_sortStop
            }
  
            for (const i in ratesLikeArray) {
              let coin = ratesLikeArray[i][0]
              let amountCoinOnByer = buyerFunds[coin]
              let amountCoinOnSeller = sellerFunds[coin]
              let ByerCoinCost = amountCoinOnByer * conversionRates[coin]
              let SellerCoinCost = amountCoinOnSeller * conversionRates[coin]
  
              if (itemCostInBronze > 0) {
                if (amountCoinOnByer == 0) continue
  
                let payedCoin = Math.ceil(payCoinCount(coin, ByerCoinCost))
                itemCostInBronze -= payedCoin * conversionRates[coin]
  
                buyerFunds[coin] -= payedCoin
                sellerFunds[coin] += payedCoin
              } else if (itemCostInBronze == 0) {
                //Need to write a message, how much cp shop did not give
                break trychange
              } else {
                if (amountCoinOnSeller == 0) continue
                let payedCoin = Math.floor(payCoinCount(coin, SellerCoinCost))
                itemCostInBronze += payedCoin * conversionRates[coin]
                if (_oldItemCostInbronze == itemCostInBronze) {
                  if (!GoToAnotherShopToExchange) {
                    let gamemaster = game.users.forEach((u) => {
                      if (u.isGM) {
                        gamemaster = u
                      }
                    })
                    break trychange
                  } else if (iteration > 3) {
                    _oldItemCostInbronze = 0
                    sellerFunds['cp'] += Math.abs(itemCostInBronze)
                  }
                }
                buyerFunds[coin] += payedCoin
                sellerFunds[coin] -= payedCoin
              }
              if (iteration > 6) {
                break trychange
              } else {
                iteration++
              }
            }
            _oldItemCostInbronze = itemCostInBronze
          }
        }
      }
  
      // Update buyer's funds
      buyer.update({
        'system.currency': buyerFunds,
      })
  
      // Update seller's funds
      seller.update({
        'system.currency': sellerFunds,
      })
  
      let moved = await this.moveItems(seller, buyer, [
        {
          itemId,
          quantity,
        },
      ])
  
      for (let m of moved) {
        // trouver l'icône DD5 correspondant à la monnaie (elles sont dans system.currency)
        let icon = `<i class="currency ${itemCostDenomination}" data-tooltip="${itemCostDenomination}"></i>`

        console.log(buyer);

        this.chatMessage(
          seller,
          buyer,
          `<span class="dnd5e2">${buyer.name} a acheté ${quantity} x ${m.item.name} pour ${itemCostRaw} ${icon}.</span>`,
          m.item,
        );

        // On envoie un message à l'acheteur
        ui.notifications.info(`Vous avez acheté ${quantity} x ${m.item.name} pour ${itemCostRaw}${itemCostDenomination}.`);
      }
    }

    chatMessage(speaker, owner, message, item) {      
        message =
          `
              <div class="dnd5e chat-card item-card" data-actor-id="${owner._id}" data-item-id="${item._id}">
                  <header class="card-header flexrow">
                      <img src="${item.img}" title="${item.name}" width="36" height="36">
                      <h3 class="item-name">${item.name}</h3>
                  </header>
  
                  <div class="message-content">
                      <p>` +
          message +
          `</p>
                  </div>
              </div>
              `
        ChatMessage.create({
          user: game.user._id,
          speaker: {
            actor: speaker,
            alias: speaker.name,
          },
          content: message,
        });
    }

    async moveItems(source, destination, items) {
      // console.log(source);
      // console.log(destination);
      // console.log(items);
  
      const updates = []
      const deletes = []
      const additions = []
      const containers = []
      const destUpdates = []
      const results = []
      for (let i of items) {
        let itemId = i.itemId
        let quantity = i.quantity
        let item = source.getEmbeddedDocument('Item', itemId)
  
        // console.log("ITEM: \n");
        // console.log(item);
  
        // Move all items if we select more than the quantity.
        if (item.system.quantity < quantity) {
          quantity = item.system.quantity
        }
  
        // If container, just move the container
        if (item.type === 'container') {
          containers.push(item)
        } else {
          let newItem = foundry.utils.duplicate(item)
  
          const update = {
            _id: itemId,
            'system.quantity': item.system.quantity - quantity,
          }
  
          if (update['system.quantity'] === 0) {
            deletes.push(itemId)
          } else {
            updates.push(update)
          }
  
          newItem.system.quantity = quantity
  
          results.push({
            item: newItem,
            quantity: quantity,
          })
  
          additions.push(newItem)
        }
      }
  
      if (updates.length > 0) {
        await source.updateEmbeddedDocuments('Item', updates)
      }
  
      if (containers.length > 0) {
        // Containers are different!
        // We have to first look through their contents, create each of those items on the destination
        // Then create a new container and link those items to that
        // We do that by setting the system.container property to the ID of the container on each item that goes into it
  
        copyAllContainers(containers, destination, source);
      }
  
      if (additions.length > 0) {
        await destination.createEmbeddedDocuments('Item', additions)
      }
  
      if (destUpdates.length > 0) {
        await destination.updateEmbeddedDocuments('Item', destUpdates)
      }
  
      if (deletes.length > 0) {
        await source.deleteEmbeddedDocuments('Item', deletes)
      }
  
      return results
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle price modifier
     * @private
     */
    async _priceModifier(event) {
      event.preventDefault()
  
      let priceModifier = await this.actor.getFlag(JulMerchantSheet.FLAG, 'priceModifier')
      if (typeof priceModifier !== 'number') priceModifier = 1.0
  
      priceModifier = Math.round(priceModifier * 100)
  
      const maxModifier = 500;
  
      var html =
        "<p>Use this slider to increase or decrease the price of all items in this inventory. <i class='fa fa-question-circle' title='This uses a percentage factor where 100% is the current price, 0% is 0, and 200% is double the price.'></i></p>"
      html +=
        '<p><input name="price-modifier-percent" id="price-modifier-percent" type="range" min="0" max="' +
        maxModifier +
        '" value="' +
        priceModifier +
        '" class="slider"></p>'
      html +=
        '<p><label>Percentage:</label> <input type=number min="0" max="' +
        maxModifier +
        '" value="' +
        priceModifier +
        '" id="price-modifier-percent-display"></p>'
      html +=
        '<script>var pmSlider = document.getElementById("price-modifier-percent"); var pmDisplay = document.getElementById("price-modifier-percent-display"); pmDisplay.value = pmSlider.value; pmSlider.oninput = function() { pmDisplay.value = this.value; }; pmDisplay.oninput = function() { pmSlider.value = this.value; };</script>'
  
      let d = new Dialog({
        title: 'Price Modifier',
        content: html,
        buttons: {
          one: {
            icon: '<i class="fas fa-check"></i>',
            label: 'Update',
            callback: () =>
              this.actor.setFlag(
                JulMerchantSheet.FLAG,
                'priceModifier',
                document.getElementById('price-modifier-percent').value / 100,
              ),
          },
          two: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => console.log('Loot Sheet | Price Modifier Cancelled'),
          },
        },
        default: 'two',
        close: () => console.log('Loot Sheet | Price Modifier Closed'),
      })
      d.render(true)
    }
  
    
    /* -------------------------------------------- */
  
    /**
     * Handle cycling permissions
     * @private
     */
    _onCyclePermissionProficiency(event) {
      event.preventDefault()
  
      let field = $(event.currentTarget).siblings('input[type="hidden"]')
  
      let level = parseFloat(field.val())
      if (typeof level === undefined) level = 0
  
      const levels = [0, 2, 3] //const levels = [0, 2, 3];
  
      let idx = levels.indexOf(level),
        newLevel = levels[idx === levels.length - 1 ? 0 : idx + 1]
  
      let playerId = field[0].name
  
      this._updatePermissions(this.actor, playerId, newLevel, event)
  
      this._onSubmit(event)
    }
  
    /* -------------------------------------------- */
  
    /**
     * Handle cycling bulk permissions
     * @private
     */
    _onCyclePermissionProficiencyBulk(event) {
      event.preventDefault()
  
      let actorData = this.actor.system
  
      let field = $(event.currentTarget).parent().siblings('input[type="hidden"]')
      let level = parseFloat(field.val())
      if (typeof level === undefined || level === 999) level = 0
  
      const levels = [0, 3, 2] //const levels = [0, 2, 3];
  
      let idx = levels.indexOf(level),
        newLevel = levels[idx === levels.length - 1 ? 0 : idx + 1]
  
      let users = game.users.entities
  
      let currentPermissions = foundry.utils.duplicate(actorData.permission)
      for (let u of users) {
        if (u.system.role === 1 || u.system.role === 2) {
          currentPermissions[u._id] = newLevel
        }
      }
      const lootPermissions = new DocumentOwnershipConfig(this.actor)
      lootPermissions._updateObject(event, currentPermissions)
  
      this._onSubmit(event)
    }
  
    _updatePermissions(actorData, playerId, newLevel, event) {
      // Read player permission on this actor and adjust to new level
      let currentPermissions = foundry.utils.duplicate(actorData.ownership)
  
      currentPermissions[playerId] = newLevel
      // Save updated player permissions
      const lootPermissions = new DocumentOwnershipConfig(this.actor)
      lootPermissions._updateObject(event, currentPermissions)
    }
  
    /* -------------------------------------------- */
  
    /**
     * Organize and classify Items for Loot NPC sheets
     * @private
     */
    // _prepareItems(context) {
    //   super._prepareItems(context);
    // }
    _prepareItems(context) {
      super._prepareItems(context)
    }
  
    /* -------------------------------------------- */
  
    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionIcon(level) {
      const icons = {
        0: '<i class="far fa-circle"></i>',
        2: '<i class="fas fa-eye"></i>',
        3: '<i class="fas fa-check"></i>',
        999: '<i class="fas fa-users"></i>',
      }
      return icons[level]
    }
  
    /* -------------------------------------------- */
  
    /**
     * Get the font-awesome icon used to display the permission level.
     * @private
     */
    _getPermissionDescription(level) {
      const description = {
        0: 'None (cannot access sheet)',
        2: 'Observer (access to sheet but can only loot or purchase items)',
        3: 'Owner (full access)',
        999: 'Change all permissions',
      }
      return description[level]
    }
  
    /* -------------------------------------------- */
  
    /**
     * Prepares GM settings to be rendered by the loot sheet.
     * @private
     */
    _prepareGMSettings(context) {
      const playerData = [],
        observers = []
      //console.log(game.users);
      //console.log("context", context);
  
      let players = game.users
  
      for (let player of players) {
        //console.log(player);
  
        if (player.character) {
          player.playerId = player._id
          //player.name = player.name;
          player.actor = player.character.name
  
          player.lootPermission = JulMerchantSheet.getLootPermissionForPlayer(context, player)
  
          //console.log("player", player);
  
          player.icon = this._getPermissionIcon(player.lootPermission)
          player.lootPermissionDescription = this._getPermissionDescription(player.lootPermission)
          playerData.push(player)
        }
      }
  
      let loot = {}
      loot.players = playerData
      context.flags.loot = loot
    }
  }
  