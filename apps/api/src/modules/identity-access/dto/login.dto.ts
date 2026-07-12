import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(2, 64)
  tenantCode!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(8, 200)
  password!: string;
}
