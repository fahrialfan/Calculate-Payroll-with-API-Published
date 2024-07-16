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
        REIMBURSEMENT: 0,
        PAID_ON_BOARD: 0,
        DEDUCTION: 0,
    };

   types.forEach(type => {
		const adjustmentUrl = `${baseUrl}/v1/company/payroll/vessel/${vesselId}/crew/${companyCrewId}/payslip/adjustment?year=${year}&month=${month}&type=${type}`;
		const adjustmentResponse = http.get(adjustmentUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		check(adjustmentResponse, {
			[`adjustment for ${type} fetched successfully`]: (res) => res.status === 200,
		});
		const adjustmentData = adjustmentResponse.json();

		// Log adjustment data for debugging
		// console.log(`Adjustment data for ${type}: ${JSON.stringify(adjustmentData)}`);

		if (Array.isArray(adjustmentData.adjustments)) {
			// Sum up adjustments based on type
			adjustments[type] = adjustmentData.adjustments.reduce((sum, adj) => {
				if (type === 'DEDUCTION' || type === 'PAID_ON_BOARD') {
					return sum - adj.amount; // Deductions and paid items are negative
				} else {
					return sum + adj.amount; // Other adjustments like REIMBURSEMENT are positive
				}
			}, 0);
		} else {
			console.error(`Expected an array for ${type} adjustments, but got: ${typeof adjustmentData.adjustments}`);
		}
	});
	
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
	console.log('CCB Data:', ccbData);
    const ccbValue = ccbData.data.reduce((sum, item) => sum + item.calculation, 0);
	console.log('CCB Value:', ccbValue);

    // Extract contract fields
    const basicSalary = contract.basicSalary;
    const fixedOvertimeAllowance = contract.fixedOvertimeAllowance;
    const leaveSalary = contract.leaveSalary;
    const tradeAllowance = contract.tradeAllowance;
    const administrationAndUniformAllowance = contract.administrationAndUniformAllowance;

    // Extract payslip info fields
    const { totalDaysOnboard, totalDaysInMonth, salaryThisMonth, adminAndUniformAllowance, adjustment } = payslipInfo.earning;
    const bpjsEmployeeOldAgeInsurance = bpjsData.bpjsEmployeeOldAgeInsurance || 0;
	const bpjsEmployeePensionInsurance = bpjsData.bpjsEmployeePensionInsurance || 0;
	const contractCompletionBonusRelease = ccbValue || 0;

    // Perform calculations
    const onboardSalary = roundToTwo(salaryThisMonth); // Use salaryThisMonth directly
    const overtimeAllowance = roundToTwo(fixedOvertimeAllowance);
    const totalEarnings = roundToTwo(onboardSalary + overtimeAllowance + leaveSalary + tradeAllowance + administrationAndUniformAllowance + adjustments.REIMBURSEMENT + contractCompletionBonusRelease);

    const totalDeduction = roundToTwo((adjustments.DEDUCTION || 0) + (adjustments.PAID_ON_BOARD || 0) - (bpjsEmployeeOldAgeInsurance || 0) - (bpjsEmployeePensionInsurance || 0));
    const totalReceived = roundToTwo(totalEarnings + totalDeduction);

    // Expected values from payslipInfo
    const expectedOnboardSalary = roundToTwo(salaryThisMonth);
    const expectedOvertimeAllowance = roundToTwo(payslipInfo.earning.overtimeAllowance);
    const expectedLeaveSalary = roundToTwo(payslipInfo.earning.leaveSalary);
    const expectedTradeAllowance = roundToTwo(payslipInfo.earning.tradeAllowance);
    const expectedAdminAndUniformAllowance = roundToTwo(adminAndUniformAllowance);
	const expectedContractCompletionBonusRelease = roundToTwo(contractCompletionBonusRelease);
    const expectedAdjustment = roundToTwo(adjustment);
    const expectedTotalEarnings = roundToTwo(payslipInfo.earning.totalEarnings);
    const expectedDeductionAdjustment = roundToTwo(payslipInfo.deduction.deductionAdjustment || 0);
    const expectedBpjsEmployeeOldAgeInsurance = roundToTwo(bpjsEmployeeOldAgeInsurance);
    const expectedBpjsEmployeePensionInsurance = roundToTwo(bpjsEmployeePensionInsurance);
    const expectedTotalDeduction = roundToTwo(payslipInfo.deduction.totalDeduction || 0);
    const expectedTotalReceived = roundToTwo(payslipInfo.totalReceived);

    // Compare calculated and expected values
    const results = {
        'onboardSalary is correct': onboardSalary === expectedOnboardSalary,
        'overtimeAllowance is correct': overtimeAllowance === expectedOvertimeAllowance,
        'leaveSalary is correct': roundToTwo(leaveSalary) === expectedLeaveSalary,
        'tradeAllowance is correct': roundToTwo(tradeAllowance) === expectedTradeAllowance,
        'administrationAndUniformAllowance is correct': roundToTwo(administrationAndUniformAllowance) === expectedAdminAndUniformAllowance,
		'contractCompletionBonusRelease is correct' : roundToTwo(contractCompletionBonusRelease) === expectedContractCompletionBonusRelease,
        'adjustment is correct': roundToTwo(adjustments.REIMBURSEMENT) === expectedAdjustment,
        'totalEarnings is correct': totalEarnings === expectedTotalEarnings,
        'deductionAdjustment is correct': roundToTwo(adjustments.DEDUCTION) === expectedDeductionAdjustment,
        'bpjsEmployeeOldAgeInsurance is correct': roundToTwo(bpjsEmployeeOldAgeInsurance) === roundToTwo(payslipInfo.deduction.bpjsEmployeeOldAgeInsurance),
		'bpjsEmployeePensionInsurance is correct': roundToTwo(bpjsEmployeePensionInsurance) === roundToTwo(payslipInfo.deduction.bpjsEmployeePensionInsurance),
        'totalDeduction is correct': totalDeduction === expectedTotalDeduction,
        'totalReceived is correct': totalReceived === expectedTotalReceived,
    };

    // Log the results
    for (const [key, value] of Object.entries(results)) {
        const expectedKey = key.split(' ')[0];
        let expectedValue, actualValue;
        switch (expectedKey) {
            case 'adjustment':
                expectedValue = expectedAdjustment;
                actualValue = roundToTwo(adjustments.REIMBURSEMENT);
                break;
            case 'deductionAdjustment':
                expectedValue = expectedDeductionAdjustment;
                actualValue = roundToTwo(adjustments.DEDUCTION);
                break;
            case 'onboardSalary':
                expectedValue = expectedOnboardSalary;
                actualValue = onboardSalary;
                break;
            case 'overtimeAllowance':
                expectedValue = expectedOvertimeAllowance;
                actualValue = overtimeAllowance;
                break;
            case 'leaveSalary':
                expectedValue = expectedLeaveSalary;
                actualValue = roundToTwo(leaveSalary);
                break;
            case 'tradeAllowance':
                expectedValue = expectedTradeAllowance;
                actualValue = roundToTwo(tradeAllowance);
                break;
            case 'administrationAndUniformAllowance':
                expectedValue = expectedAdminAndUniformAllowance;
                actualValue = roundToTwo(administrationAndUniformAllowance);
                break;
			case 'contractCompletionBonusRelease':
				expectedValue = expectedContractCompletionBonusRelease;
                actualValue = roundToTwo(contractCompletionBonusRelease);
                break;
            case 'totalEarnings':
                expectedValue = expectedTotalEarnings;
                actualValue = totalEarnings;
                break;
            case 'bpjsEmployeeOldAgeInsurance':
                expectedValue = expectedBpjsEmployeeOldAgeInsurance;
                actualValue = roundToTwo(bpjsEmployeeOldAgeInsurance);
                break;
            case 'bpjsEmployeePensionInsurance':
                expectedValue = expectedBpjsEmployeePensionInsurance;
                actualValue = roundToTwo(bpjsEmployeePensionInsurance);
                break;
            case 'totalDeduction':
                expectedValue = expectedTotalDeduction;
                actualValue = totalDeduction;
                break;
            case 'totalReceived':
                expectedValue = expectedTotalReceived;
                actualValue = totalReceived;
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
        'totalDeduction is correct': (r) => r['totalDeduction is correct'],
        'totalReceived is correct': (r) => r['totalReceived is correct'],
    });
}
