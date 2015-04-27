﻿/* jshint -W079 */
var Atomia = Atomia || {};
Atomia.ViewModels = Atomia.ViewModels || {};
/* jshint +W079 */

(function (exports, _, ko, utils, domainsApi, viewModels) {
    'use strict';

    /**
     * Create domain registration item view model
     * @param {Object} domainItemData - the object to create a domain registration item from.
     */
    function DomainRegistrationItem(domainItemData, cart) {
        var self = this;
        var domainParts = domainItemData.DomainName.split('.');

        _.extend(self, new viewModels.ProductMixin(domainItemData, cart));

        self.isPrimary = self.attrs.premium === 'true';
        self.uniqueId = _.uniqueId('dmn');
        self.domainNameSld = domainParts[0];
        self.domainNameTld = domainParts[1];
        self.status = domainItemData.Status;

        /** 
         * Overrides ProductMixin property.
         * Checks if domain registration item is equal to other item based on article number and domain name.
         * @param {Object} other - The item to compare to
         * @returns {boolean} whether the items are equal or not.
         */
        self.equals = function equals(other) {
            return self.articleNumber === other.articleNumber && self.attrs.domainName === other.attrs.domainName;
        };

        viewModels.addCartItemExtensions(cart, self);
    }


    /** 
     * Create domain registration view model.
     * @param {Object} cart - instance of cart to add or remove items to.
     */
    function DomainRegistrationModel(cart) {
        var self = this;

        self.submittedQuery = ko.observable();
        self.query = ko.observable();
        self.isLoadingResults = ko.observable(false);
        self.showMoreResults = ko.observable(false);
        self.primaryResults = ko.observableArray();
        self.secondaryResults = ko.observableArray();
        self.noResults = ko.observable(false);

        self.hasResults = ko.pureComputed(function () {
            return self.primaryResults().length > 0 || self.secondaryResults().length > 0;
        });

        self.createDomainRegistrationItem = function (domainItemData) {
            return new DomainRegistrationItem(domainItemData, cart);
        };

        /** Submit a domain search query. */
        self.submit = function submit() {
            self.isLoadingResults(true);
            self.primaryResults.removeAll();
            self.secondaryResults.removeAll();
            self.showMoreResults(false);
            self.submittedQuery(self.query());
            self.noResults(false);
            
            domainsApi.findDomains(self.query(), function (data) {
                var domainSearchId = data.DomainSearchId;

                if (data.Results.length === 0 && data.FinishSearch) {
                    self.noResults(true);
                    self.isLoadingResults(false);
                }
                else if (data.FinishSearch) {
                    self.updateResults(data.Result);
                }
                else {
                    domainsApi.checkStatus(domainSearchId,
                        function (data) {
                            if (data.Results.length === 0 && data.FinishSearch) {
                                self.noResults(true);
                                self.isLoadingResults(false);
                            }
                            else {
                                self.updateResults(data.Results);
                            }
                        });
                }
            });
        };
        
        /** Primary TLD search results have finished loading. */
        self.primaryResultsAreFinished = function primaryResultsAreFinished() {
            if (self.primaryResults().length === 0) {
                return false;
            }

            return !_.any(self.primaryResults(), function (r) {
                return r.status === 'loading';
            });
        };

        /** 
         * Create domain registration items from primary and secondary TLD results and update view model.
         * @param {Array} results - The domain search results.
         */
        self.updateResults = function updateResults(results) {
            var primaryResults = [],
                secondaryResults = [];

            _.each(results, function (result) {
                var item = self.createDomainRegistrationItem(result);

                if (item.isPrimary) {
                    primaryResults.push(item);
                }
                else {
                    secondaryResults.push(item);
                }
            });

            // Set all at once to avoid triggering bindings on each push.
            self.primaryResults(primaryResults);
            self.secondaryResults(secondaryResults);

            if (self.primaryResultsAreFinished()) {
                self.isLoadingResults(false);
            }
        };

        /** Show more results */
        self.setShowMoreResults = function setShowMoreResults() {
            self.showMoreResults(true);
        };

        /**
         * Get template name to use for rendering 'item': 'domainregistration-{primary|secondary}-{available|taken|<status>}
         * @param {Object} item - The item to select template name for
         * @returns the template name.
         */
        self.getTemplateName = function getTemplateName(item) {
            
            if (item.isPrimary && item.status === 'available') {
                return 'domainregistration-primary-available';
            }
            else if (item.isPrimary) {
                return 'domainregistration-primary-taken';
            }
            else {
                return 'domainregistration-secondary-' + item.status;
            }
        };
    }



    /* Module exports */
    _.extend(exports, {
        DomainRegistrationItem: DomainRegistrationItem,
        DomainRegistrationModel: DomainRegistrationModel
    });

})(Atomia.ViewModels, _, ko, Atomia.Utils, Atomia.Api.Domains, Atomia.ViewModels);
