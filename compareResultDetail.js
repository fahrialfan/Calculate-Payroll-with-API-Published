import http from 'k6/http';
import { check } from 'k6';
import { setup as loginSetup } from './login.js';

const baseUrl = 'https://orca.redisea.com';

function roundToTwo(num) {
    return Math.round(num * 100) / 100;
}

export function setup() {
    return loginSetup(); // Call the setup function from login.js to get the accessToken
}

export default function (data) {
    if (!data || !data.accessToken) {
        console.error('No access token, skipping default function execution');
        return;
    }

    const accessToken = data.accessToken;

    // Hardcoded values for companyCrewID, year, and month etc
    const companyCrewId = 'da98070b-cef3-4142-bfc2-31e75014cc08';
    const vesselId = 'f63df855-0d56-45c9-948e-3ed80258faec';
    const year = 2024;
    const month = 7;
    const types = ['REIMBURSEMENT', 'PAID_ON_BOARD', 'DEDUCTION'];
	const purpose = 'THIS_MONTH_RELEASED';

    // Construct the URLs with the provided parameters
    const payslipInfoUrl = `${baseUrl}/v1/company/payroll/vessel/${vesselId}/crew/${companyCrewId}/payslip/info?year=${year}&month=${month}`;
    const contractUrl = `${baseUrl}/v1/company/contract/${companyCrewId}`;
	const bpjsUrl = `${baseUrl}/v1/company/payroll/vessel/${vesselId}/crew/${companyCrewId}/payslip/adjustment/bpjs?year=${year}&month=${month}`;
	const ccbUrl = `${baseUrl}/v1/company/payroll/vessel/${vesselId}/crew/${companyCrewId}/payslip/ccb?year=${year}&month=${month}&purpose=${purpose}`;
	
    
	// Fetch payslip info
	const payslipInfoResponse = http.get(payslipInfoUrl, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	check(payslipInfoResponse, {
		'payslip info fetched successfully': (res) => res.status === 200,
	});

	const payslipInfo = payslipInfoResponse.json();
	//console.log('Payslip Info:', payslipInfo); // Log the entire payslip info for debugging
	
    // Fetch contract details
    const contractResponse = http.get(contractUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    check(contractResponse, {
        'contract details fetched successfully': (res) => res.status === 200,
    });
	
	const bpjsResponse = http.get(bpjsUrl, {
    headers: {
        Authorization: `Bearer ${accessToken}`,
    },
	});
	check(bpjsResponse, {
		'BPJS adjustments fetched successfully': (res) => res.status === 200,
	});
	const bpjsData = bpjsResponse.json();

    const contract = contractResponse.json();
    //console.log(`Contract data: ${JSON.stringify(contract)}`);

    // Fetch adjustments
    let adjustments = {
		REIMBURSEMENT: [],
		PAID_ON_BOARD: [],
		DEDUCTION: [],
	};

	types.forEach(type => {
		const adjustmentUrl = `${baseUrl}/v1/company/payroll/vessel/${vesselId}/crew/${companyCrewId}/payslip/adjustment?year=${year}&month=${month}&type=${type}`;
		const adjustmentResponse = http.get(adjustmentUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});;
		check(adjustmentResponse, {
			[`adjustment for ${type} fetched successfully`]: (res) => res.status === 200,
		});
		const adjustmentData = adjustmentResponse.json();

		// Log adjustment data for debugging
		if (type === 'REIMBURSEMENT') {
			console.log(`Adjustment data for ${type}: ${JSON.stringify(adjustmentData)}`);
		}


		if (Array.isArray(adjustmentData.adjustments)) {
			// Store adjustments based on type
			adjustments[type] = adjustmentData.adjustments.map(adj => adj.amount);
		} else {
			console.error(`Expected an array for ${type} adjustments, but got: ${typeof adjustmentData.adjustments}`);
		}
	});
	
	const totalAdjustments = {
		REIMBURSEMENT: adjustments.REIMBURSEMENT.reduce((sum, amount) => sum + amount, 0),
		PAID_ON_BOARD: adjustments.PAID_ON_BOARD.reduce((sum, amount) => sum - amount, 0),
		DEDUCTION: adjustments.DEDUCTION.reduce((sum, amount) => sum - amount, 0), 
	};
	

	
	// Fetch CCB data
    const ccbResponse = http.get(ccbUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    check(ccbResponse, {
        'ccb data fetched successfully': (res) => res.status === 200,
    });

    const ccbData = ccbResponse.json();
	//console.log('CCB Data:', ccbData);
    const ccbValue = ccbData.data.reduce((sum, item) => sum + item.calculation, 0);
	//console.log('CCB Value:', ccbValue);

    // Extract contract fields
    const basicSalaryContract = contract.basicSalary;
    const fixedOvertimeAllowanceContract = contract.fixedOvertimeAllowance;
    const leaveSalaryContract = contract.leaveSalary;
    const tradeAllowanceContract = contract.tradeAllowance;
    const administrationAndUniformAllowanceContract = contract.administrationAndUniformAllowance;
	const othersContract = contract.others;
	const onBoardSalaryContract = basicSalaryContract + fixedOvertimeAllowanceContract + leaveSalaryContract + tradeAllowanceContract + administrationAndUniformAllowanceContract + othersContract;
	
    // Extract payslip info fields
    const bpjsEmployeeOldAgeInsurance = bpjsData.bpjsEmployeeOldAgeInsurance || 0;
	const bpjsEmployeePensionInsurance = bpjsData.bpjsEmployeePensionInsurance || 0;

    // Perform calculations
    const onboardSalaryCalculated = roundToTwo((payslipInfo.earning.totalDaysOnboard * onBoardSalaryContract) / payslipInfo.earning.totalDaysInMonth);
	
	// Expected values
    const expectedOnboardSalary = roundToTwo(onboardSalaryCalculated);
    const expectedOvertimeAllowance = roundToTwo(fixedOvertimeAllowanceContract);
    const expectedLeaveSalary = roundToTwo(leaveSalaryContract);
    const expectedTradeAllowance = roundToTwo(tradeAllowanceContract);
    const expectedAdminAndUniformAllowance = roundToTwo(administrationAndUniformAllowanceContract);
	const expectedContractCompletionBonusRelease = roundToTwo(ccbValue);
    const expectedAdjustment = roundToTwo(totalAdjustments.REIMBURSEMENT || 0);
    const expectedTotalEarnings = roundToTwo(expectedOnboardSalary + expectedOvertimeAllowance + expectedLeaveSalary + expectedTradeAllowance + expectedAdminAndUniformAllowance + expectedContractCompletionBonusRelease + expectedAdjustment);
    const expectedDeductionAdjustment = roundToTwo(totalAdjustments.DEDUCTION || 0);
	const expectedPaidOnBoard = roundToTwo(totalAdjustments.PAID_ON_BOARD || 0);
    const expectedBpjsEmployeeOldAgeInsurance = roundToTwo(bpjsEmployeeOldAgeInsurance);
    const expectedBpjsEmployeePensionInsurance = roundToTwo(bpjsEmployeePensionInsurance);
    const expectedTotalDeduction = roundToTwo((expectedDeductionAdjustment || 0) + (expectedPaidOnBoard || 0) - (bpjsEmployeeOldAgeInsurance || 0) - (bpjsEmployeePensionInsurance || 0));
    const expectedTotalReceived = roundToTwo(expectedTotalEarnings + expectedTotalDeduction);

    // Compare calculated and expected values
    const results = {
        'onboardSalary is correct': roundToTwo(payslipInfo.earning.salaryThisMonth) === expectedOnboardSalary,
        'overtimeAllowance is correct': roundToTwo(payslipInfo.earning.overtimeAllowance) === expectedOvertimeAllowance,
        'leaveSalary is correct': roundToTwo(payslipInfo.earning.leaveSalary) === expectedLeaveSalary,
        'tradeAllowance is correct': roundToTwo(payslipInfo.earning.tradeAllowance) === expectedTradeAllowance,
        'administrationAndUniformAllowance is correct': roundToTwo(payslipInfo.earning.adminAndUniformAllowance) === expectedAdminAndUniformAllowance,
		'contractCompletionBonusRelease is correct' : roundToTwo(payslipInfo.earning.contractCompletionBonusRelease) === expectedContractCompletionBonusRelease,
        'adjustment is correct': roundToTwo(payslipInfo.earning.adjustment) === expectedAdjustment,
        'totalEarnings is correct': roundToTwo(payslipInfo.earning.totalEarnings) === expectedTotalEarnings,
        'deductionAdjustment is correct': roundToTwo(payslipInfo.deduction.deductionAdjustment) === expectedDeductionAdjustment,
        'bpjsEmployeeOldAgeInsurance is correct': roundToTwo(payslipInfo.deduction.bpjsEmployeeOldAgeInsurance) ===  roundToTwo(bpjsEmployeeOldAgeInsurance),
		'bpjsEmployeePensionInsurance is correct': roundToTwo(payslipInfo.deduction.bpjsEmployeePensionInsurance) ===  roundToTwo(bpjsEmployeePensionInsurance) ,
		'paidOnBoard is correct':  roundToTwo(-payslipInfo.deduction.paidOnBoard) === roundToTwo(expectedPaidOnBoard),
        'totalDeduction is correct': roundToTwo(payslipInfo.deduction.totalDeduction) === expectedTotalDeduction,
        'totalReceived is correct': roundToTwo(payslipInfo.totalReceived) === expectedTotalReceived,
    };

    // Log the results
    for (const [key, value] of Object.entries(results)) {
        const expectedKey = key.split(' ')[0];
        let expectedValue, actualValue;
        switch (expectedKey) {
            case 'adjustment':
                expectedValue = expectedAdjustment;
                actualValue = roundToTwo(payslipInfo.earning.adjustment);
                break;
            case 'deductionAdjustment':
                expectedValue = expectedDeductionAdjustment;
                actualValue = roundToTwo(payslipInfo.deduction.deductionAdjustment);
                break;
            case 'onboardSalary':
                expectedValue = expectedOnboardSalary;
                actualValue = roundToTwo(payslipInfo.earning.salaryThisMonth);
                break;
            case 'overtimeAllowance':
                expectedValue = expectedOvertimeAllowance;
                actualValue = roundToTwo(payslipInfo.earning.overtimeAllowance);
                break;
            case 'leaveSalary':
                expectedValue = expectedLeaveSalary;
                actualValue = roundToTwo(payslipInfo.earning.leaveSalary);
                break;
            case 'tradeAllowance':
                expectedValue = expectedTradeAllowance;
                actualValue = roundToTwo(payslipInfo.earning.tradeAllowance);
                break;
            case 'administrationAndUniformAllowance':
                expectedValue = expectedAdminAndUniformAllowance;
                actualValue = roundToTwo(payslipInfo.earning.adminAndUniformAllowance);
                break;
			case 'contractCompletionBonusRelease':
				expectedValue = expectedContractCompletionBonusRelease;
                actualValue = roundToTwo(payslipInfo.earning.contractCompletionBonusRelease);
                break;
            case 'totalEarnings':
                expectedValue = expectedTotalEarnings;
                actualValue = roundToTwo(payslipInfo.earning.totalEarnings);
                break;
            case 'bpjsEmployeeOldAgeInsurance':
                expectedValue = expectedBpjsEmployeeOldAgeInsurance;
                actualValue = roundToTwo(payslipInfo.deduction.bpjsEmployeeOldAgeInsurance);
                break;
            case 'bpjsEmployeePensionInsurance':
                expectedValue = expectedBpjsEmployeePensionInsurance;
                actualValue = roundToTwo(payslipInfo.deduction.bpjsEmployeePensionInsurance);
                break;
			case 'paidOnBoard':
                expectedValue = roundToTwo(expectedPaidOnBoard);
                actualValue = roundToTwo(payslipInfo.deduction.paidOnBoard);
                break;
            case 'totalDeduction':
                expectedValue = expectedTotalDeduction;
                actualValue = roundToTwo(payslipInfo.deduction.totalDeduction);
                break;
            case 'totalReceived':
                expectedValue = expectedTotalReceived;
                actualValue = roundToTwo(payslipInfo.totalReceived);
                break;
            default:
                expectedValue = null;
                actualValue = null;
                break;
        }
        console.log(`${key}: ${value ? 'PASS' : 'FAIL'}`);
        console.log(`Expected: ${expectedValue}, Actual: ${actualValue}`);
    }

    // Check the results
    check(results, {
        'onboardSalary is correct': (r) => r['onboardSalary is correct'],
        'overtimeAllowance is correct': (r) => r['overtimeAllowance is correct'],
        'leaveSalary is correct': (r) => r['leaveSalary is correct'],
        'tradeAllowance is correct': (r) => r['tradeAllowance is correct'],
        'administrationAndUniformAllowance is correct': (r) => r['administrationAndUniformAllowance is correct'],
		'contractCompletionBonusRelease is correct': (r) => r['contractCompletionBonusRelease is correct'],
        'adjustment is correct': (r) => r['adjustment is correct'],
        'totalEarnings is correct': (r) => r['totalEarnings is correct'],
        'deductionAdjustment is correct': (r) => r['deductionAdjustment is correct'],
        'bpjsEmployeeOldAgeInsurance is correct': (r) => r['bpjsEmployeeOldAgeInsurance is correct'],
        'bpjsEmployeePensionInsurance is correct': (r) => r['bpjsEmployeePensionInsurance is correct'],
		'paidOnBoard is correct': (r) => r['paidOnBoard is correct'],
        'totalDeduction is correct': (r) => r['totalDeduction is correct'],
        'totalReceived is correct': (r) => r['totalReceived is correct'],
    });
}
