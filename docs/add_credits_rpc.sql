-- Create a function to add credits to a user securely
CREATE OR REPLACE FUNCTION add_credits(target_user_id UUID, amount INT)
RETURNS void AS $$
BEGIN
  -- Update the profiles table by adding the amount to the current credits
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + amount
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to service role only, or authenticated if we want to restrict it
-- It's SECURITY DEFINER, so we should revoke public access
REVOKE ALL ON FUNCTION add_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_credits(UUID, INT) TO service_role;
