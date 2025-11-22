// rental_property_analysis.js

document.addEventListener('DOMContentLoaded', () => {
    // Check for login status first as this is an authenticated tool
    if (typeof window.checkAccessAndRedirect === 'function') {
        // NOTE: If you haven't implemented your full header/nav yet, 
        // you may need to comment this line out locally if it causes redirect loops.
        // window.checkAccessAndRedirect('rental_property_analysis.html'); 
    }

    const form = document.getElementById('property-analysis-form');
    const resultsContainer = document.getElementById('results-container');
    const calculateBtn = document.getElementById('calculate-btn');
    const showMessage = window.showMessage || console.error; // Use global message function

    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    /**
     * Handles form submission and triggers the API calculation.
     */
    async function handleFormSubmit(e) {
        e.preventDefault();
        
        // 1. Reset UI State
        resultsContainer.classList.add('hidden');
        calculateBtn.disabled = true;
        calculateBtn.textContent = 'Calculating...';
        
        // 2. Gather Inputs
        const inputs = {
            purchasePrice: parseFloat(document.getElementById('purchase-price').value),
            rentalIncome: parseFloat(document.getElementById('rental-income').value),
            operatingExpenses: parseFloat(document.getElementById('operating-expenses').value),
            downPaymentPct: parseFloat(document.getElementById('down-payment-pct').value),
            interestRate: parseFloat(document.getElementById('interest-rate').value),
            loanTermYears: parseFloat(document.getElementById('loan-term-years').value),
            monthlyPmi: parseFloat(document.getElementById('monthly-pmi').value) || 0,
            closingCosts: parseFloat(document.getElementById('closing-costs').value) || 0,
            repairBudget: parseFloat(document.getElementById('repair-budget').value) || 0,
            vacancyPct: parseFloat(document.getElementById('vacancy-pct').value) || 0,
        };
        
        // 3. API Call
        const token = localStorage.getItem('tmt_auth_token');
        if (!token) {
            showMessage("Session expired. Please log in.", true);
            window.location.href = 'auth.html?mode=login';
            return;
        }

        try {
            const response = await fetch('/api/tmt/analyze-property', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(inputs)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                renderResults(result.data);
                showMessage('Calculation successful!', false);
            } else {
                throw new Error(result.message || 'Calculation failed due to a server error.');
            }

        } catch (error) {
            console.error('Property Analysis Error:', error);
            showMessage(error.message, true);
        } finally {
            calculateBtn.disabled = false;
            calculateBtn.textContent = 'Calculate Metrics';
        }
    }

    /**
     * Renders the calculated metrics into the results container.
     */
    function renderResults(data) {
        // Helper to format currency
        const formatCurrency = (value) => `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        // Helper to format percentage
        const formatPercent = (value) => `${Number(value).toFixed(2)}%`;

        // Determine CoC text color
        const cocReturnClass = parseFloat(data.cocReturn) > 0 ? 'text-tmt-secondary' : 'text-red-500';
        
        // Update DOM elements
        document.getElementById('result-noi').textContent = formatCurrency(data.noi);
        document.getElementById('result-cap-rate').textContent = formatPercent(data.capRate);
        document.getElementById('result-cap-rate').className = `result-value ${parseFloat(data.capRate) > 5 ? 'text-tmt-primary' : 'text-yellow-500'}`;

        document.getElementById('result-coc-return').textContent = formatPercent(data.cocReturn);
        document.getElementById('result-coc-return').className = `result-value ${cocReturnClass}`;
        
        document.getElementById('result-monthly-cf').textContent = formatCurrency(data.monthlyCashFlow);
        
        document.getElementById('result-total-investment').textContent = formatCurrency(data.totalInvestment);

        // Show results
        resultsContainer.classList.remove('hidden');
        
        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});