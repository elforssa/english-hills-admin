export function createInitialChargeCoordinator(initialStudentId = '', initialChargeId = '') {
  let pending = Boolean(initialStudentId && initialChargeId);
  let activeStudentId = '';
  let requestVersion = 0;

  return {
    selectStudent(studentId, { fromInitialLink = false } = {}) {
      activeStudentId = studentId || '';
      requestVersion += 1;
      if (!fromInitialLink) pending = false;
    },
    clearStudent() {
      activeStudentId = '';
      requestVersion += 1;
      pending = false;
    },
    userSelectedCharge() {
      pending = false;
    },
    startChargeLoad(studentId) {
      activeStudentId = studentId || '';
      requestVersion += 1;
      return { studentId: activeStudentId, version: requestVersion };
    },
    resolveChargeLoad(request, charges = []) {
      if (request.version !== requestVersion || request.studentId !== activeStudentId) {
        return { status: 'stale' };
      }
      if (!pending || request.studentId !== initialStudentId) {
        return { status: 'ready' };
      }
      pending = false;
      const charge = charges.find((item) => item.id === initialChargeId);
      return charge ? { status: 'apply', charge } : { status: 'missing' };
    },
  };
}

export function emptyChargeTerms() {
  return {
    charge_id: '', session_type: '', service_description: '', plan_type: 'Standard',
    level: '', gross_amount: '', discount_amount: '', due_date: '', payment_amount: '',
  };
}
