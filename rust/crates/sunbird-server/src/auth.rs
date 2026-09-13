        // Flip the last signature nibble to one that is guaranteed to differ.
        // This used to always write '0', which left the token byte-identical
        // whenever the signature already ended in '0' — 1 in 16, since sign()
        // is hex::encode — so the test failed on roughly one CI run in sixteen.
        let last = token
            .chars()
            .next_back()
            .expect("issued token is non-empty");
        let flipped = if last == '0' { '1' } else { '0' };
        bad.replace_range(token.len() - 1.., &flipped.to_string());
        assert_ne!(bad, token, "tampering must actually change the token");
