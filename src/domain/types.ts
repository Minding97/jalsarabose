export type ID = string;
export type ISODate = string;
export type YearMonth = string;

export type HouseholdRole = 'admin' | 'member';
export type EventType = 'expense' | 'chore' | 'fridge';

export type ExpenseCategory = 'rent' | 'utilities' | 'living' | 'subscription' | 'other';
export type ExpenseStatus = 'scheduled' | 'paid' | 'overdue';
export type ContributionMode = 'equal' | 'custom';

export type ChoreRepeatCycle = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type ChoreStatus = 'scheduled' | 'done' | 'missed';

export type FridgeCategory = 'vegetable' | 'fruit' | 'meat' | 'dairy' | 'side' | 'sauce' | 'other';
export type StorageType = 'fridge' | 'freezer' | 'room';
export type FridgeStatus = 'stocked' | 'used' | 'discarded';

export type Household = {
  id: ID;
  name: string;
  inviteCode: string;
  createdBy: ID;
  createdAt: ISODate;
};

export type HouseholdMember = {
  id: ID;
  householdId: ID;
  userId: ID;
  name: string;
  role: HouseholdRole;
  joinedAt: ISODate;
};

export type Expense = {
  id: ID;
  householdId: ID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  dueDate: ISODate;
  paymentMethod?: string;
  payerId?: ID;
  splitRatio?: Record<ID, number>;
  isRecurring: boolean;
  status: ExpenseStatus;
  memo?: string;
  createdBy: ID;
  createdAt: ISODate;
  notificationEnabled: boolean;
};

export type MonthlyBudget = {
  id: ID;
  householdId: ID;
  month: YearMonth;
  totalAmount: number;
  contributionMode: ContributionMode;
  memberContributions: Record<ID, number>;
  createdBy: ID;
  createdAt: ISODate;
  updatedBy: ID;
  updatedAt: ISODate;
};

export type Chore = {
  id: ID;
  householdId: ID;
  title: string;
  assigneeId: ID;
  dueDate: ISODate;
  repeatCycle: ChoreRepeatCycle;
  score: number;
  status: ChoreStatus;
  memo?: string;
  createdBy: ID;
  createdAt: ISODate;
  notificationEnabled: boolean;
};

export type FridgeItem = {
  id: ID;
  householdId: ID;
  name: string;
  category: FridgeCategory;
  quantity?: string;
  storageType: StorageType;
  expiryDate?: ISODate;
  status: FridgeStatus;
  memo?: string;
  createdBy: ID;
  createdAt: ISODate;
  notificationEnabled: boolean;
};

export type HouseholdSnapshot = {
  household: Household;
  members: HouseholdMember[];
  monthlyBudgets: MonthlyBudget[];
  expenses: Expense[];
  chores: Chore[];
  fridgeItems: FridgeItem[];
};

export type HouseholdEvent = {
  id: ID;
  type: EventType;
  typeLabel: string;
  title: string;
  subtitle: string;
  date: ISODate;
  status: string;
  tone: 'primary' | 'accent' | 'warning' | 'danger' | 'info';
};

export type UserProfile = {
  uid: ID;
  email: string;
  displayName: string;
  activeHouseholdId?: ID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type ExpenseInput = Pick<
  Expense,
  | 'title'
  | 'category'
  | 'amount'
  | 'dueDate'
  | 'paymentMethod'
  | 'payerId'
  | 'splitRatio'
  | 'isRecurring'
  | 'status'
  | 'memo'
  | 'notificationEnabled'
>;

export type MonthlyBudgetInput = Pick<
  MonthlyBudget,
  'month' | 'totalAmount' | 'contributionMode' | 'memberContributions'
>;

export type ChoreInput = Pick<
  Chore,
  | 'title'
  | 'assigneeId'
  | 'dueDate'
  | 'repeatCycle'
  | 'score'
  | 'status'
  | 'memo'
  | 'notificationEnabled'
>;

export type FridgeItemInput = Pick<
  FridgeItem,
  | 'name'
  | 'category'
  | 'quantity'
  | 'storageType'
  | 'expiryDate'
  | 'status'
  | 'memo'
  | 'notificationEnabled'
>;
