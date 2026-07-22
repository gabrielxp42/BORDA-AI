export const maskPhone = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  } else if (v.length > 6) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  } else if (v.length > 0) {
    v = v.replace(/^(\d*)/, "($1");
  }
  return v;
};

export const maskCpfCnpj = (value: string) => {
  let v = value.replace(/\D/g, "");
  
  if (v.length <= 11) {
    if (v.length > 9) {
      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
    } else if (v.length > 6) {
      v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
    } else if (v.length > 3) {
      v = v.replace(/^(\d{3})(\d{0,3})/, "$1.$2");
    }
    return v;
  } else {
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 12) {
      v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5");
    } else if (v.length > 8) {
      v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, "$1.$2.$3/$4");
    } else if (v.length > 5) {
      v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{0,3})/, "$1.$2");
    }
    return v;
  }
};
