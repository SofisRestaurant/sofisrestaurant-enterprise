CREATE OR REPLACE FUNCTION prevent_financial_transaction_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial_transactions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_financial_transaction_update_trigger
BEFORE UPDATE ON financial_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_financial_transaction_update();


CREATE OR REPLACE FUNCTION prevent_financial_transaction_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial_transactions cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_financial_transaction_delete_trigger
BEFORE DELETE ON financial_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_financial_transaction_delete();