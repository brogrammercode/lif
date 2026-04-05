export const UserGender = {
    MALE: "MALE",
    FEMALE: "FEMALE",
    OTHER: "OTHER",
} as const;

export const UserMaritalStatus = {
    SINGLE: "SINGLE",
    MARRIED: "MARRIED",
    DIVORCED: "DIVORCED",
    WIDOWED: "WIDOWED",
} as const;

export type UserGender = (typeof UserGender)[keyof typeof UserGender];
export type UserMaritalStatus = (typeof UserMaritalStatus)[keyof typeof UserMaritalStatus];