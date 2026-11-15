import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  labelClassName?: string;
}

export function Field({ label, labelClassName, ...input }: Readonly<FieldProps>) {
  return (
    <label>
      <span className={labelClassName}>{label}</span>
      <input {...input} />
    </label>
  );
}

type PasswordFieldProps = Omit<FieldProps, "type"> & { current?: boolean };

export function PasswordField({ current = false, ...input }: Readonly<PasswordFieldProps>) {
  return (
    <Field
      type="password"
      autoComplete={current ? "current-password" : "new-password"}
      minLength={current ? undefined : 8}
      maxLength={128}
      required
      {...input}
    />
  );
}

export function ErrorAlert({ message }: Readonly<{ message: string }>) {
  return message ? (
    <div className="alert alert--error" role="alert">
      {message}
    </div>
  ) : null;
}
