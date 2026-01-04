import  jwt  from "jsonwebtoken";
import { email } from "zod";

export const generateToken = (users) => {
    return jwt.sign(
        {
            id: users.id,
            email: users.email,
            role_id: users.role_id,
        },
        process.env.JWT_KEY,
        { expiresIn: "10d" }
    );
}